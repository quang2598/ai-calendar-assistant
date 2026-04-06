"""Tests for location-based service recommendation tools."""

import json
import pytest
from unittest.mock import MagicMock, patch

from agent.tools.location_tools import (
    ConfirmUserLocationInput,
    GetServiceRecommendationInput,
    GetPlaceDetailsInput,
    build_location_tools,
    _confirm_user_location_impl,
    _get_service_recommendations_impl,
    _get_place_details_impl,
    _get_coordinates_from_address,
    _format_place_result,
    _json_tool_response,
)


class TestJsonToolResponse:
    """Test JSON response formatting."""

    def test_basic_response(self):
        response = _json_tool_response("success", "Test message")
        data = json.loads(response)
        assert data["status"] == "success"
        assert data["message"] == "Test message"

    def test_response_with_payload(self):
        response = _json_tool_response(
            "success",
            "Test message",
            key1="value1",
            key2=42,
        )
        data = json.loads(response)
        assert data["status"] == "success"
        assert data["message"] == "Test message"
        assert data["key1"] == "value1"
        assert data["key2"] == 42


class TestConfirmUserLocationInput:
    """Test location confirmation input validation."""

    def test_with_address(self):
        input_data = ConfirmUserLocationInput(
            address="123 Main St, San Francisco, CA"
        )
        assert input_data.address == "123 Main St, San Francisco, CA"
        assert input_data.latitude is None
        assert input_data.longitude is None

    def test_with_coordinates(self):
        input_data = ConfirmUserLocationInput(latitude=37.7749, longitude=-122.4194)
        assert input_data.latitude == 37.7749
        assert input_data.longitude == -122.4194
        assert input_data.address is None

    def test_with_both(self):
        input_data = ConfirmUserLocationInput(
            address="123 Main St",
            latitude=37.7749,
            longitude=-122.4194,
        )
        assert input_data.address == "123 Main St"
        assert input_data.latitude == 37.7749
        assert input_data.longitude == -122.4194

    def test_extra_fields_forbidden(self):
        with pytest.raises(ValueError):
            ConfirmUserLocationInput(address="123 Main St", extra_field="bad")


class TestGetServiceRecommendationInput:
    """Test service recommendation input validation."""

    def test_minimal_input(self):
        input_data = GetServiceRecommendationInput(service_type="restaurant")
        assert input_data.service_type == "restaurant"
        assert input_data.location is None
        assert input_data.latitude is None
        assert input_data.longitude is None
        assert input_data.radius_meters == 5000
        assert input_data.max_results == 5

    def test_with_custom_radius(self):
        input_data = GetServiceRecommendationInput(
            service_type="mechanic",
            radius_meters=10000,
        )
        assert input_data.radius_meters == 10000

    def test_with_address(self):
        input_data = GetServiceRecommendationInput(
            service_type="hospital",
            location="New York, NY",
        )
        assert input_data.service_type == "hospital"
        assert input_data.location == "New York, NY"

    def test_radius_validation(self):
        # Too small
        with pytest.raises(ValueError):
            GetServiceRecommendationInput(
                service_type="restaurant",
                radius_meters=50,
            )
        # Too large
        with pytest.raises(ValueError):
            GetServiceRecommendationInput(
                service_type="restaurant",
                radius_meters=100000,
            )


class TestGetPlaceDetailsInput:
    """Test place details input validation."""

    def test_with_place_name(self):
        input_data = GetPlaceDetailsInput(place_name="Pho The Good Times Asian Bistro")
        assert input_data.place_name == "Pho The Good Times Asian Bistro"
        assert input_data.include_reviews is True

    def test_without_reviews(self):
        input_data = GetPlaceDetailsInput(
            place_name="Pho The Good Times Asian Bistro",
            include_reviews=False,
        )
        assert input_data.include_reviews is False


class TestFormatPlaceResult:
    """Test place result formatting."""

    def test_format_complete_place(self):
        place_data = {
            "place_id": "ChIJ123",
            "name": "Test Restaurant",
            "formatted_address": "123 Main St, City, ST",
            "rating": 4.5,
            "user_ratings_total": 100,
            "types": ["restaurant", "food"],
            "business_status": "OPERATIONAL",
            "geometry": {"location": {"lat": 37.7749, "lng": -122.4194}},
        }
        formatted = _format_place_result(place_data)
        assert formatted["place_id"] == "ChIJ123"
        assert formatted["name"] == "Test Restaurant"
        assert formatted["rating"] == 4.5
        assert formatted["user_ratings_total"] == 100

    def test_format_minimal_place(self):
        place_data = {
            "place_id": "ChIJ123",
            "name": "Test Place",
        }
        formatted = _format_place_result(place_data)
        assert formatted["place_id"] == "ChIJ123"
        assert formatted["name"] == "Test Place"


class TestGetCoordinatesFromAddress:
    """Test geocoding functionality."""

    def test_successful_geocoding(self):
        mock_gmaps = MagicMock()
        mock_gmaps.geocode.return_value = [
            {
                "geometry": {
                    "location": {"lat": 37.7749, "lng": -122.4194}
                }
            }
        ]
        coords = _get_coordinates_from_address(mock_gmaps, "San Francisco, CA")
        assert coords == (37.7749, -122.4194)

    def test_geocoding_failure(self):
        mock_gmaps = MagicMock()
        mock_gmaps.geocode.return_value = []
        coords = _get_coordinates_from_address(mock_gmaps, "Invalid Address")
        assert coords is None


class TestConfirmUserLocation:
    """Test location confirmation implementation."""

    def test_missing_input(self):
        mock_gmaps = MagicMock()
        response = _confirm_user_location_impl(
            gmaps_client=mock_gmaps,
            address=None,
            latitude=None,
            longitude=None,
        )
        data = json.loads(response)
        assert data["status"] == "missing_fields"

    def test_with_address(self):
        mock_gmaps = MagicMock()
        mock_gmaps.geocode.return_value = [
            {
                "geometry": {
                    "location": {"lat": 37.7749, "lng": -122.4194}
                }
            }
        ]
        response = _confirm_user_location_impl(
            gmaps_client=mock_gmaps,
            address="San Francisco, CA",
            latitude=None,
            longitude=None,
        )
        data = json.loads(response)
        assert data["status"] == "success"
        assert data["location"]["address"] == "San Francisco, CA"
        assert data["location"]["latitude"] == 37.7749
        assert data["location"]["longitude"] == -122.4194

    def test_with_coordinates(self):
        mock_gmaps = MagicMock()
        mock_gmaps.reverse_geocode.return_value = [
            {"formatted_address": "123 Main St, San Francisco, CA"}
        ]
        response = _confirm_user_location_impl(
            gmaps_client=mock_gmaps,
            address=None,
            latitude=37.7749,
            longitude=-122.4194,
        )
        data = json.loads(response)
        assert data["status"] == "success"
        assert data["location"]["latitude"] == 37.7749
        assert data["location"]["longitude"] == -122.4194


class TestGetServiceRecommendations:
    """Test service recommendation implementation."""

    def test_missing_location(self):
        mock_gmaps = MagicMock()
        response = _get_service_recommendations_impl(
            gmaps_client=mock_gmaps,
            service_type="restaurant",
            location=None,
            latitude=None,
            longitude=None,
            radius_meters=5000,
            max_results=5,
            user_location=None,
        )
        data = json.loads(response)
        assert data["status"] == "missing_fields"

    def test_with_coordinates(self):
        mock_gmaps = MagicMock()
        mock_gmaps.places_nearby.return_value = {
            "status": "OK",
            "results": [
                {
                    "place_id": "ChIJ1",
                    "name": "Restaurant 1",
                    "rating": 4.5,
                    "user_ratings_total": 100,
                },
                {
                    "place_id": "ChIJ2",
                    "name": "Restaurant 2",
                    "rating": 4.0,
                    "user_ratings_total": 80,
                },
            ],
        }
        response = _get_service_recommendations_impl(
            gmaps_client=mock_gmaps,
            service_type="restaurant",
            location=None,
            latitude=37.7749,
            longitude=-122.4194,
            radius_meters=5000,
            max_results=5,
            user_location=None,
        )
        data = json.loads(response)
        assert data["status"] == "success"
        assert len(data["recommendations"]) == 2

    def test_no_results(self):
        mock_gmaps = MagicMock()
        mock_gmaps.places_nearby.return_value = {
            "status": "OK",
            "results": [],
        }
        response = _get_service_recommendations_impl(
            gmaps_client=mock_gmaps,
            service_type="restaurant",
            location=None,
            latitude=37.7749,
            longitude=-122.4194,
            radius_meters=5000,
            max_results=5,
            user_location=None,
        )
        data = json.loads(response)
        assert data["status"] == "no_results"


class TestGetPlaceDetails:
    """Test place details implementation."""

    def test_get_details_with_reviews(self):
        mock_gmaps = MagicMock()
        mock_gmaps.place.return_value = {
            "status": "OK",
            "result": {
                "place_id": "ChIJ123",
                "name": "Test Restaurant",
                "rating": 4.5,
                "user_ratings_total": 100,
                "website": "https://example.com",
                "formatted_phone_number": "+1-555-0100",
                "reviews": [
                    {
                        "author_name": "John Doe",
                        "rating": 5,
                        "text": "Great place!",
                        "relative_time_description": "1 month ago",
                    }
                ],
            },
        }
        response = _get_place_details_impl(
            gmaps_client=mock_gmaps,
            place_id="ChIJ123",
            include_reviews=True,
        )
        data = json.loads(response)
        assert data["status"] == "success"
        assert data["place"]["name"] == "Test Restaurant"
        assert data["place"]["rating"] == 4.5
        assert len(data["place"]["reviews"]) == 1

    def test_get_details_without_reviews(self):
        mock_gmaps = MagicMock()
        mock_gmaps.place.return_value = {
            "status": "OK",
            "result": {
                "place_id": "ChIJ123",
                "name": "Test Restaurant",
                "rating": 4.5,
                "user_ratings_total": 100,
            },
        }
        response = _get_place_details_impl(
            gmaps_client=mock_gmaps,
            place_id="ChIJ123",
            include_reviews=False,
        )
        data = json.loads(response)
        assert data["status"] == "success"
        assert "reviews" not in data["place"] or data["place"]["reviews"] is None


class TestBuildLocationTools:
    """Test location tools building."""

    def test_build_with_valid_api_key(self):
        tools = build_location_tools(google_places_api_key="test-api-key")
        assert len(tools) == 3
        tool_names = [tool.name for tool in tools]
        assert "confirm_user_location" in tool_names
        assert "get_service_recommendations" in tool_names
        assert "get_place_details" in tool_names

    def test_build_without_api_key(self):
        with pytest.raises(ValueError):
            build_location_tools(google_places_api_key="")

    def test_build_with_empty_api_key(self):
        with pytest.raises(ValueError):
            build_location_tools(google_places_api_key="   ")
