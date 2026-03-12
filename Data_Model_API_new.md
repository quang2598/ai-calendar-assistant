The model focuses on core entities: Users (for authentication and personalization), Conversations (history), Events (calendar/tasks), Reminders (notifications), and Recommendations (suggestions during chats). Recommendations are embedded within Conversations for simplicity, as they are prompt-driven and transient.

#### **Schemas (in JSON-like format for MongoDB documents)**

1. **User**  
   1. Collection: users  
   2. Fields:  
      1. \_id: ObjectId (auto-generated primary key)  
      2. name: String (e.g., "Quang Dang")  
      3. email: String (unique, for login)  
      4. phone\_number: String (for SMS/calls, e.g., "+1-541-123-4567")  
      5. google\_auth\_token: String (OAuth token for Google Calendar API) (optional)  
      6. preferences: Object (e.g., { "location": "Eugene, OR", "default\_timezone": "PST" }) (Add address1 and 2\)  
      7. created\_at: Date  
      8. updated\_at: Date  
2. **Conversation**

   1. Collection: conversations  
   2. Fields:  
      1. \_id: ObjectId  
      2. user\_id: ObjectId (reference to User)  
      3. title: String (auto-generated or user-set, e.g., "Daily Schedule Chat")  
      4. messages: Array of Objects \- (Tuan) Are we ordering the messages by timestamp?

\# Updated Firebase database model

{

    “userid”: UUID,

    “conversations”: \[

        “createdAt”: timestamp,

        “lastUpdated”: timestamp,

        “conversationId”: UUID,

        “messages”: \[

            {

                “createdAt”: timestamp,

                “role”: “user” | “system”,

                “text”: string

            }

        \],

        *//..more attribute*

    \],

    *//... more attribute*

}

	(Quang) Yes we can order by timestamps. Since AI need time to process and response to each message, I don’t think we need separate ids for messages.

Look up rate limiter/ debouncer 

Make sure ISO or Firebase specific for timestamps

1. Each message: { role: String ("user" or "agent"), content: String, timestamp: Date, type: String ("text", "voice", "recommendation") }

Think about context for each msg

5. status: String ("active", "archived")  
   6. created\_at: Date  
      7. updated\_at: Date

**3\. Event**

1. Collection: events  
   2. Fields:  
      1. \_id: ObjectId  
      2. event\_type : Dict  
      3. user\_id: ObjectId (reference to User)  
      4. google\_event\_id: String (sync key with Google Calendar)  
      5. title: String  
      6. description: String  
      7. start\_time: Date  
      8. end\_time: Date  
      9. location: String (e.g., "Eugene, OR")  
      10. attendees: Array of Objects (emails or phones and status)  
      11. status: String ("scheduled", "completed", "canceled")  
      12. created\_at: Date  
      13. updated\_at: Date

      14. More (repeat, color,etc.) \-\> research

   **4\. Reminder**

   1. Collection: reminders  
   2. Fields:  
      1. \_id: ObjectId  
      2. user\_id: ObjectId (reference to User)  
      3. event\_id: ObjectId (reference to Event, optional if standalone)  
      4. reminder\_time: Date  
      5. method: String ("notification", "sms", "call")  
      6. message: String (e.g., "Reminder: Doctor appointment in 30 min")  
      7. status: String ("pending", "sent", "failed")  
      8. created\_at: Date  
      9. updated\_at: Date

   **5\. Recommendation** (Embedded in Conversation messages for efficiency; not a separate collection unless needed for querying)

   1. Within a message object: If type is "recommendation", add sub-fields:  
      1. details: Object (e.g., { "location": "Nearby cafe", "weather": "Sunny 65°F", "price": "$10-15", "suggestion": "Book at 2 PM" })

**Notes on Data Model:**

* **Relationships**: Use references (ObjectIds) for linking. In a relational DB, these would be foreign keys.  
* **Indexing**: Add indexes on user\_id, created\_at for fast queries.  
* **Security**: Store sensitive data (e.g., tokens) encrypted. Use schemas validation in MongoDB.  
* **Scalability**: Conversations can grow large; consider sharding or archiving old ones.  
* **Integration**: Events/Reminders sync with Google Calendar via API; local storage acts as cache or for offline.

### **CRUD API**

I'll design a RESTful CRUD API split between the two services:

* **Agent Server**: Handles chat-related CRUD (Conversations, Recommendations via messages), and intelligent ops (Events, Reminders).  
* **General Request Service**: Handles user management, history saving, and general CRUD for persistence.

Use JWT for authentication (from Milestone 3 Security). All endpoints under /api/v1. Assume HTTPS, rate limiting, and error handling (e.g., 400 Bad Request, 401 Unauthorized, 404 Not Found, 500 Internal Error).

#### **Base Structure for Requests/Responses**

* Headers: Authorization: Bearer \<JWT\>  
* Request Bodies: JSON  
* Responses: JSON with { "data": ..., "message": "Success" } or error details.

#### **Endpoints by Entity**

1. **User (Handled by General Request Service) \- (Tuan) We would need to include something to validate user to prevent this user from deleting other user. We might be able to include JWT token in every action towards user information? (GET, UPDATE, DELET)**

- (Quang) I agree that we need to implement JWT for Read, Update and Delete API

  * **Create**: POST /users  
    * Body: { "name": "...", "email": "...", "phone\_number": "...", "google\_auth\_token": "..." }  
    * Response: 201 Created, { "data": { "\_id": "...", ... } }  
  * **Read (Get One)**: GET /users/:id

    * Response: 200 OK, { "data": { ...user fields... } }

  * **Read (List)**: GET /users (admin only, with query params like ?email=...)

    * (Tuan) Are we building an admin dashboard? I don’t think this endpoint is relevant or necessary for customer facing service

    * (Quang) Yeah we can just skip this one (Nice to have) (Good for debug tho)

    * Response: 200 OK, { "data": \[users\] }

  * **Update**: PUT /users/:id

    * Body: { updates, e.g., "phone\_number": "new" }  
    * Response: 200 OK, updated user

  * **Delete**: DELETE /users/:id

    * Response: 204 No Content

2. **Conversation (Handled by General Request Service for storage; Agent Server for active chats) \- These request must be accompanied by the JWT token to ensure security**

   * **Create**: POST /conversations

     * Body: { "user\_id": "...", "title": "..." } (messages start empty)  
     * Response: 201 Created, new conversation

   * **Read (Get One)**: GET /conversations/:id

     * Query Params: ?include\_messages=true (to load full history)  
     * Response: 200 OK, conversation data

   * **Read (List by User)**: GET /conversations?user\_id=:user\_id

     * Query Params: ?status=active\&limit=10\&sort=-created\_at  
     * Response: 200 OK, array of conversations

   * **Update (Add Message)**: PATCH /conversations/:id/messages (special for appending) \- (Tuan) Are we updating the same conversation in the database? Because the message attribute is in conversation model and it is an array

   * (Quang) Right, so this is when the user wants to go back to a conversation in history and continue with where they left off. 

     * Body: { "role": "user", "content": "...", "type": "text" }  
     * Response: 200 OK, updated conversation

   * **Delete**: DELETE /conversations/:id

     * Response: 204 No Content

3. **Event (Handled by Agent Server, with Google sync) \- (Tyson) Why do we need API for these functionality? We are expecting the agent to interact with Google Calendar, we don’t need these APIs do we?**

   **(Quang) Interesting. I agree we don’t need these endpoints, but we need to implement a set of tools that AI can call, and what tools to implement along with input for those tools should follow a similar model as mentioned here**

   * **Create**: POST /events

     * Body: { "user\_id": "...", "title": "...", "start\_time": "2026-02-10T10:00:00Z", ... }  
     * Notes: Triggers Google Calendar create; stores google\_event\_id.  
     * Response: 201 Created, new event

   * **Read (Get One)**: GET /events/:id

     * Response: 200 OK, event data

   * **Read (List by User)**: GET /events?user\_id=:user\_id

     * Query Params: ?start\_time\_gt=...\&status=scheduled  
     * Response: 200 OK, array of events

   * **Update**: PUT /events/:id

     * Body: updates (syncs to Google)  
     * Response: 200 OK, updated event

   * **Delete**: DELETE /events/:id

     * Notes: Deletes from Google too.  
     * Response: 204 No Content

4. **Reminder (Handled by Agent Server) \- Same comment as above (Event)**

   * **Create**: POST /reminders

     * Body: { "user\_id": "...", "event\_id": "...", "reminder\_time": "...", "method": "sms" }  
     * Notes: Schedules job (e.g., via cron or queue).  
     * Response: 201 Created, new reminder

   * **Read (Get One)**: GET /reminders/:id

     * Response: 200 OK, reminder data

   * **Read (List by User)**: GET /reminders?user\_id=:user\_id

     * Query Params: ?status=pending  
     * Response: 200 OK, array of reminders

   * **Update**: PUT /reminders/:id

     * Body: updates (e.g., change time)  
     * Response: 200 OK, updated reminder

   * **Delete**: DELETE /reminders/:id

     * Response: 204 No Content

**Additional Endpoints (Non-CRUD):**

* **Chat Interaction (Agent Server)**: POST /agent/chat

  * Body: { "conversation\_id": "...", "prompt": "Schedule a meeting..." }  
  * Response: { "response": "Done\! Event created.", "recommendations": \[...\] } (parses prompt, creates Event/Reminder if needed)

* **General Request (General Service)**: POST /general/request

  * Body: { "type": "save\_history", "data": {conversation updates} }  
  * Response: 200 OK, processed

Ask AI for industry standard

