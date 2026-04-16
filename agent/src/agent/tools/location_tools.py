from __future__ import annotations

import json
from typing import List, Optional
import googlemaps
from googlemaps.exceptions import ApiError

from langchain.tools import tool
from pydantic import BaseModel, ConfigDict, Field

from utility.tracing_utils import trace_span


class ConfirmUserLocationInput(BaseModel):
    """Input model for confirming/getting user location."""
    address: Optional[str] = Field(
        default=None,
        description=(
            "Optional user's address or location name. "
            "For example: '123 Main St, San Francisco, CA' or 'Central Park, New York'"
        ),
    )
    zip_code: Optional[str] = Field(
        default=None,
        description=(
            "Optional ZIP/postal code. For example: '94102' or '94102-1234'. "
            "Can be combined with city/state for better accuracy."
        ),
    )
    city: Optional[str] = Field(
        default=None,
        description="Optional city name to improve zip code accuracy.",
    )
    state: Optional[str] = Field(
        default=None,
        description="Optional state or province abbreviation (e.g., 'CA', 'NY') to improve zip code accuracy.",
    )
    country: Optional[str] = Field(
        default=None,
        description="Optional country name or code (e.g., 'USA', 'Canada'). Defaults to USA.",
    )
    latitude: Optional[float] = Field(
        default=None,
        description="Optional latitude coordinate for precise location.",
    )
    longitude: Optional[float] = Field(
        default=None,
        description="Optional longitude coordinate for precise location.",
    )

    model_config = ConfigDict(extra="forbid")


class GetServiceRecommendationInput(BaseModel):
    """Input model for getting service recommendations."""
    keyword: str = Field(
        description=(
            "Search keyword for the service you're looking for. Examples: 'dessert', 'ice cream', 'bakery', "
            "'restaurant', 'coffee shop', 'gym', 'hospital', 'hotel', 'pizza', 'thai food', etc. "
            "Any natural language search term is supported. The system will search Google Places for matching services."
        ),
    )
    location: Optional[str] = Field(
        default=None,
        description=(
            "Optional location address or name where to search nearby services. "
            "If not provided, user's last confirmed location will be used."
        ),
    )
    zip_code: Optional[str] = Field(
        default=None,
        description=(
            "Optional ZIP/postal code to search around. For example: '94102' or '10001'. "
            "Can be combined with city/state for better accuracy."
        ),
    )
    city: Optional[str] = Field(
        default=None,
        description="Optional city name to improve zip code search accuracy.",
    )
    state: Optional[str] = Field(
        default=None,
        description="Optional state or province abbreviation (e.g., 'CA', 'NY') to improve zip code search accuracy.",
    )
    latitude: Optional[float] = Field(
        default=None,
        description="Optional latitude coordinate for the search location.",
    )
    longitude: Optional[float] = Field(
        default=None,
        description="Optional longitude coordinate for the search location.",
    )
    radius_meters: int = Field(
        default=8000,
        ge=100,
        le=50000,
        description="Search radius in meters. Default is 8km (~5 miles).",
    )
    max_results: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum number of recommendations to return.",
    )

    model_config = ConfigDict(extra="forbid")


class GetPlaceDetailsInput(BaseModel):
    """Input model for getting detailed information about a place."""
    place_name: str = Field(
        description="Business/place name to get details for. Example: 'Pho The Good Times Asian Bistro'."
    )
    include_reviews: bool = Field(
        default=True,
        description="Whether to include customer reviews and ratings.",
    )

    model_config = ConfigDict(extra="forbid")


def _json_tool_response(status: str, message: str, **payload: object) -> str:
    """Format tool response as JSON."""
    body = {
        "status": status,
        "message": message,
    }
    body.update(payload)
    return json.dumps(body, ensure_ascii=True)


def _format_address_from_components(
    address: Optional[str],
    zip_code: Optional[str],
    city: Optional[str],
    state: Optional[str],
    country: Optional[str],
) -> tuple[str, list[str]]:
    """Format a complete address from individual components.
    
    Returns primary address and list of fallback addresses for robust geocoding.
    Zip code alone is valid and should be tried first.
    
    Args:
        address: Full address string
        zip_code: ZIP/postal code
        city: City name
        state: State/province abbreviation
        country: Country name or code
        
    Returns:
        Tuple of (primary_address, [fallback_addresses])
    """
    primary = ""
    fallbacks = []
    
    # If we have zip code, it's the primary (most direct)
    if zip_code and zip_code.strip():
        zip_code_clean = zip_code.strip()
        primary = zip_code_clean
        
        # Build fallback with city/state/country if provided
        if city or state or country:
            parts = []
            if city and city.strip():
                parts.append(city.strip())
            if state and state.strip():
                parts.append(state.strip())
            parts.append(zip_code_clean)
            if country and country.strip():
                parts.append(country.strip())
            fallbacks.append(", ".join(parts))
        
        # Try with country code (USA by default for zip codes)
        if not country or country.lower() in ('usa', 'us', 'united states'):
            fallbacks.append(f"{zip_code_clean}, USA")
    
    # Fall back to full address if provided
    if address and address.strip():
        if not primary:
            primary = address.strip()
        else:
            fallbacks.append(address.strip())
    
    # Build from city/state/country if no primary yet
    if not primary and (city or state):
        parts = []
        if city and city.strip():
            parts.append(city.strip())
        if state and state.strip():
            parts.append(state.strip())
        if country and country.strip():
            parts.append(country.strip())
        if parts:
            primary = ", ".join(parts)
    
    return primary, fallbacks


def _get_coordinates_from_address(
    gmaps_client: googlemaps.Client,
    address: str,
) -> tuple[float, float] | None:
    """Geocode an address to get latitude and longitude.
    
    Handles zip codes and partial addresses with fallback strategies.
    
    Args:
        gmaps_client: Google Maps client instance
        address: Address to geocode (can be zip code, partial address, etc.)
        
    Returns:
        Tuple of (latitude, longitude) or None if geocoding fails
    """
    if not address or not address.strip():
        return None
    
    cleaned_address = address.strip()
    
    try:
        result = gmaps_client.geocode(address=cleaned_address)
        if result and len(result) > 0:
            location = result[0]["geometry"]["location"]
            return location["lat"], location["lng"]
    except ApiError as exc:
        raise ValueError(f"Failed to geocode address '{address}': {exc}")
    
    return None


def _try_geocode_with_fallbacks(
    gmaps_client: googlemaps.Client,
    primary_address: str,
    fallback_addresses: Optional[List[str]] = None,
) -> tuple[float, float] | None:
    """Try to geocode an address with multiple fallback attempts.
    
    Useful when a primary address (like just a zip code) might not geocode well.
    
    Args:
        gmaps_client: Google Maps client instance
        primary_address: Primary address to try first
        fallback_addresses: List of fallback addresses to try if primary fails
        
    Returns:
        Tuple of (latitude, longitude) or None if all attempts fail
    """
    addresses_to_try = [primary_address]
    if fallback_addresses:
        addresses_to_try.extend(fallback_addresses)
    
    for attempt_address in addresses_to_try:
        if not attempt_address or not attempt_address.strip():
            continue
        
        try:
            coords = _get_coordinates_from_address(gmaps_client, attempt_address)
            if coords:
                return coords
        except Exception:
            # Continue to next fallback
            continue
    
    return None


def _format_place_result(place_data: dict) -> dict:
    """Format a place result from Google Places API."""
    return {
        "place_id": place_data.get("place_id"),
        "name": place_data.get("name"),
        "formatted_address": place_data.get("formatted_address"),
        "rating": place_data.get("rating"),
        "user_ratings_total": place_data.get("user_ratings_total"),
        "types": place_data.get("types", []),
        "opening_hours": place_data.get("opening_hours", {}),
        "business_status": place_data.get("business_status"),
        "geometry": {
            "location": place_data.get("geometry", {}).get("location"),
        },
    }


def _lookup_place_id_by_name(
    gmaps_client: googlemaps.Client,
    place_name: str,
    user_location: Optional[tuple[float, float]] = None,
) -> Optional[str]:
    """Look up Google Places place_id from a human-readable place name."""
    query = (place_name or "").strip()
    if not query:
        return None

    try:
        search_kwargs = {"query": query}
        if user_location and len(user_location) == 2:
            search_kwargs["location"] = user_location

        result = gmaps_client.places(**search_kwargs)
        if result.get("status") != "OK":
            return None

        places = result.get("results", [])
        if not places:
            return None

        return places[0].get("place_id")
    except Exception:
        return None


@trace_span("tool_confirm_user_location")
def _confirm_user_location_impl(
    gmaps_client: googlemaps.Client,
    address: Optional[str],
    zip_code: Optional[str],
    city: Optional[str],
    state: Optional[str],
    country: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
) -> str:
    """Confirm or resolve user's location."""
    # Validate input
    has_coordinates = latitude is not None and longitude is not None
    has_address = address is not None and address.strip()
    has_zip_info = zip_code is not None and zip_code.strip()

    if not has_coordinates and not has_address and not has_zip_info:
        return _json_tool_response(
            status="missing_fields",
            message="Need either an address/location name, zip code, or coordinates (latitude/longitude) to confirm location.",
        )

    try:
        # If coordinates provided, reverse geocode to get address
        if has_coordinates:
            try:
                result = gmaps_client.reverse_geocode(
                    latlng=(latitude, longitude)
                )
                if result:
                    formatted_address = result[0]["formatted_address"]
                    return _json_tool_response(
                        status="success",
                        message="Location confirmed.",
                        location={
                            "address": formatted_address,
                            "latitude": latitude,
                            "longitude": longitude,
                        },
                    )
            except ApiError as exc:
                return _json_tool_response(
                    status="error",
                    message=f"Failed to reverse geocode coordinates: {exc}",
                )

        # Format address from components (prioritizes zip code if provided)
        formatted_address, fallback_addresses = _format_address_from_components(
            address=address,
            zip_code=zip_code,
            city=city,
            state=state,
            country=country,
        )
        
        if not formatted_address:
            return _json_tool_response(
                status="missing_fields",
                message="Could not format location. Please provide an address, zip code, or coordinates.",
            )

        # Try to geocode with fallback strategy
        coords = _try_geocode_with_fallbacks(gmaps_client, formatted_address, fallback_addresses)
        if coords:
            lat, lng = coords
            return _json_tool_response(
                status="success",
                message="Location confirmed.",
                location={
                    "address": formatted_address,
                    "latitude": lat,
                    "longitude": lng,
                },
            )
        else:
            return _json_tool_response(
                status="error",
                message=f"Could not find location '{formatted_address}'. Please verify the address or zip code.",
            )

    except ValueError as exc:
        return _json_tool_response(
            status="invalid_input",
            message=str(exc),
        )
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Error confirming location: {exc}",
        )


@trace_span("tool_get_service_recommendations")
def _get_service_recommendations_impl(
    gmaps_client: googlemaps.Client,
    keyword: str,
    location: Optional[str],
    zip_code: Optional[str],
    city: Optional[str],
    state: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
    radius_meters: int,
    max_results: int,
    user_location: Optional[tuple[float, float]],
) -> str:
    """Get service recommendations based on location and keyword."""
    # Normalize the keyword
    final_search_keyword = keyword.lower().strip()
    
    # Determine search location
    search_lat, search_lng = None, None

    if latitude is not None and longitude is not None:
        search_lat, search_lng = latitude, longitude
    elif location:
        coords = _get_coordinates_from_address(gmaps_client, location)
        if coords:
            search_lat, search_lng = coords
        else:
            return _json_tool_response(
                status="error",
                message=f"Could not find location '{location}'.",
            )
    elif zip_code or city or state:
        # Format address from zip code components with fallback strategy
        formatted_address, fallback_addresses = _format_address_from_components(
            address=None,
            zip_code=zip_code,
            city=city,
            state=state,
            country=None,
        )
        if formatted_address:
            coords = _try_geocode_with_fallbacks(gmaps_client, formatted_address, fallback_addresses)
            if coords:
                search_lat, search_lng = coords
            else:
                return _json_tool_response(
                    status="error",
                    message=f"Could not find location with the provided information. Please verify the zip code or address.",
                )
        else:
            return _json_tool_response(
                status="missing_fields",
                message="Need a location to search from. Provide address, zip code, coordinates, or confirm your location first.",
            )
    elif user_location:
        search_lat, search_lng = user_location
    else:
        return _json_tool_response(
            status="missing_fields",
            message="Need a location to search from. Provide address, zip code with city/state, coordinates, or confirm your location first.",
        )

    try:
        # Search for nearby places using the determined search keyword
        places_result = gmaps_client.places_nearby(
            location=(search_lat, search_lng),
            radius=radius_meters,
            keyword=final_search_keyword,
            rank_by=None,  # Use radius ranking
        )

        if places_result["status"] != "OK":
            message = places_result.get("error_message", "No results found.")
            return _json_tool_response(
                status="no_results",
                message=message,
            )

        # Format results
        places = places_result.get("results", [])[:max_results]
        if not places:
            # Provide more helpful message when no results found
            location_info = ""
            if zip_code:
                location_info = f"zip code {zip_code}"
                if city or state:
                    location_info += f" ({city or ''}{', ' if city and state else ''}{state or ''})"
            elif location:
                location_info = f"location '{location}'"
            else:
                location_info = f"coordinates ({search_lat}, {search_lng})"
            
            return _json_tool_response(
                status="no_results",
                message=f"No results for '{keyword}' found near {location_info} within {radius_meters}m. Try expanding the search radius or providing a different location.",
                search_location={
                    "latitude": search_lat,
                    "longitude": search_lng,
                },
            )

        formatted_places = [_format_place_result(place) for place in places]

        return _json_tool_response(
            status="success",
            message=f"Found {len(formatted_places)} results for '{keyword}' nearby.",
            search_location={
                "latitude": search_lat,
                "longitude": search_lng,
            },
            keyword=keyword,
            radius_meters=radius_meters,
            recommendations=formatted_places,
        )

    except ApiError as exc:
        return _json_tool_response(
            status="error",
            message=f"Google Places API error: {exc}",
        )
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Error fetching recommendations: {exc}",
        )


@trace_span("tool_get_place_details")
def _get_place_details_impl(
    gmaps_client: googlemaps.Client,
    place_id: str,
    include_reviews: bool,
) -> str:
    """Get detailed information about a specific place."""
    try:
        fields = [
            "place_id",
            "name",
            "formatted_address",
            "rating",
            "user_ratings_total",
            "website",
            "formatted_phone_number",
            "opening_hours",
            "business_status",
            "reviews" if include_reviews else None,
        ]
        fields = [f for f in fields if f is not None]

        place_details = gmaps_client.place(
            place_id=place_id,
            fields=fields,
        )

        if place_details["status"] != "OK":
            message = place_details.get("error_message", "Could not fetch place details.")
            return _json_tool_response(
                status="error",
                message=message,
            )

        result = place_details["result"]

        detail_response = {
            "place_id": result.get("place_id"),
            "name": result.get("name"),
            "formatted_address": result.get("formatted_address"),
            "rating": result.get("rating"),
            "user_ratings_total": result.get("user_ratings_total"),
            "website": result.get("website"),
            "phone": result.get("formatted_phone_number"),
            "business_status": result.get("business_status"),
            "opening_hours": result.get("opening_hours"),
        }

        # Format reviews if available
        if include_reviews and "reviews" in result:
            reviews = result["reviews"][:5]  # Top 5 reviews
            formatted_reviews = [
                {
                    "author": review.get("author_name"),
                    "rating": review.get("rating"),
                    "text": review.get("text"),
                    "time": review.get("relative_time_description"),
                }
                for review in reviews
            ]
            detail_response["reviews"] = formatted_reviews

        return _json_tool_response(
            status="success",
            message="Place details retrieved successfully.",
            place=detail_response,
        )

    except ApiError as exc:
        return _json_tool_response(
            status="error",
            message=f"Google Places API error: {exc}",
        )
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Error fetching place details: {exc}",
        )


def build_location_tools(
    google_places_api_key: str,
    user_location: Optional[tuple[float, float]] = None,
) -> List:
    """Build location and service recommendation tools.
    
    Args:
        google_places_api_key: Google Places API key for authentication
        user_location: Optional cached user location (latitude, longitude)
        
    Returns:
        List of location tools
    """
    if not google_places_api_key or not google_places_api_key.strip():
        raise ValueError("google_places_api_key must not be empty.")

    # Initialize Google Maps client
    gmaps_client = googlemaps.Client(key=google_places_api_key)

    @tool(args_schema=ConfirmUserLocationInput)
    def confirm_user_location(
        address: Optional[str] = None,
        zip_code: Optional[str] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        country: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
    ) -> str:
        """Confirm or resolve the user's current location.
        
        Provide either an address/location name, zip code (with optional city/state), 
        OR coordinates (latitude/longitude).
        This establishes the user's location for service searches.
        
        Args:
            address: Address or location name to confirm
            zip_code: ZIP/postal code (can be combined with city/state)
            city: City name to improve zip code accuracy
            state: State or province abbreviation
            country: Country name or code
            latitude: Latitude coordinate
            longitude: Longitude coordinate
            
        Returns:
            JSON string with confirmed location or error message
        """
        return _confirm_user_location_impl(
            gmaps_client=gmaps_client,
            address=address,
            zip_code=zip_code,
            city=city,
            state=state,
            country=country,
            latitude=latitude,
            longitude=longitude,
        )

    @tool(args_schema=GetServiceRecommendationInput)
    def get_service_recommendations(
        keyword: str,
        location: Optional[str] = None,
        zip_code: Optional[str] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        radius_meters: int = 5000,
        max_results: int = 5,
    ) -> str:
        """Find nearby services and businesses based on keyword and location.
        
        Searches for nearby services using natural language keywords. Supports any search term
        like 'dessert', 'ice cream', 'bakery', 'restaurant', 'coffee', 'gym', 'hospital', etc.
        The system converts these terms to appropriate Google Places search queries.

        Use this tool ONLY when the user is searching/discovering options.
        Do NOT use this tool for follow-up details about a specific already-listed place.
        For follow-up detail requests, use get_place_details with the relevant place_id.
        
        Args:
            keyword: Search keyword for the service (required). Examples: 'dessert', 'pizza',
                    'gym', 'hospital', 'coffee shop', 'thai restaurant', etc.
            location: Location address or name to search from
            zip_code: ZIP/postal code to search around (can be combined with city/state)
            city: City name to improve zip code search accuracy
            state: State or province abbreviation
            latitude: Latitude coordinate for search location
            longitude: Longitude coordinate for search location
            radius_meters: Search radius in meters (default 5000)
            max_results: Maximum number of results to return (default 5)
            
        Returns:
            JSON string with service recommendations or error message
        """
        return _get_service_recommendations_impl(
            gmaps_client=gmaps_client,
            keyword=keyword,
            location=location,
            zip_code=zip_code,
            city=city,
            state=state,
            latitude=latitude,
            longitude=longitude,
            radius_meters=radius_meters,
            max_results=max_results,
            user_location=user_location,
        )

    @tool(args_schema=GetPlaceDetailsInput)
    def get_place_details(
        place_name: str,
        include_reviews: bool = True,
    ) -> str:
        """Get detailed information about a specific place.
        
        Retrieves comprehensive details including website, phone, hours,
        and customer reviews for a place found in search results.

        Preferred for follow-up user requests like:
        - "more details"
        - "tell me more about <place name>"
        - "details for the first/second option"
        
        Args:
            place_name: Human-readable business/place name
            include_reviews: Whether to include customer reviews (default True)
            
        Returns:
            JSON string with place details and reviews
        """
        resolved_place_id = _lookup_place_id_by_name(
            gmaps_client=gmaps_client,
            place_name=place_name,
            user_location=user_location,
        )

        if not resolved_place_id:
            return _json_tool_response(
                status="no_results",
                message=f"Could not find place '{place_name}'. Please provide a more specific name.",
            )

        return _get_place_details_impl(
            gmaps_client=gmaps_client,
            place_id=resolved_place_id,
            include_reviews=include_reviews,
        )

    return [confirm_user_location, get_service_recommendations, get_place_details]
