# Walter AI Response System - Workflow Design

## Phase 5.6 - AI Response Generation Flow

### Overview
This document defines the complete workflow for Walter's AI-powered chat responses, from user message to AI reply with context-aware intelligence.

---

## Workflow Sequence

### 1. **User Message Reception**
**Entry Point:** User sends message via Walter chat interface

**Flow:**
- Frontend: User types message and clicks send
- API Call: `POST /api/walter/chats/:chatId/messages`
- Request Body: `{ content: "user message text", role: "user" }`
- Authentication: Validates userId from session
- Storage: Save user message to `chat_messages` table

**Exit Point:** User message stored, ready for AI processing

---

### 2. **Context Gathering**
**Entry Point:** User message saved successfully

**Flow:**
```
1. Fetch Walter's Purpose
   - Query: `walter_purpose` table WHERE userId = current user
   - Fallback: Use default purpose if not found
   - Result: Purpose text string

2. Fetch Recent Memories
   - Query: `walter_memory` table WHERE userId = current user
   - Filter: importance >= 4 OR createdAt within last 7 days
   - Order: importance DESC, createdAt DESC
   - Limit: Top 5 memories
   - Result: Array of memory objects

3. Fetch Chat History
   - Query: `chat_messages` table WHERE chatId = current chat
   - Limit: Last N messages (based on walterMemoryDepth setting, default 20)
   - Order: createdAt ASC
   - Result: Array of message objects

4. Fetch Chat Summary (if exists)
   - Query: Latest summary from `chat_messages` WHERE role = "summary"
   - Result: Summary text or null
```

**Exit Point:** Context packet assembled with purpose, memories, history, summary

---

### 3. **Prompt Construction**
**Entry Point:** Context data gathered

**Prompt Template:**
```
SYSTEM PROMPT:
You are Walter, an AI SysAdmin Co-Pilot for a cryptocurrency trading platform.

WALTER'S PURPOSE:
{purpose_text}

RELEVANT MEMORIES (Key Learnings):
{memory_1.content} [Importance: {memory_1.importance}, Date: {memory_1.createdAt}]
{memory_2.content} [Importance: {memory_2.importance}, Date: {memory_2.createdAt}]
...

CONVERSATION CONTEXT:
{chat_summary_if_exists}

RECENT CHAT HISTORY:
{message_1.role}: {message_1.content}
{message_2.role}: {message_2.content}
...

USER MESSAGE:
{user_message}

TASK:
Respond clearly and concisely based on your purpose and trading knowledge. 
If the question is off-topic, politely redirect to trading/system matters.
Use your memories to provide informed answers.
```

**Exit Point:** Complete prompt ready for AI model

---

### 4. **AI Response Generation**
**Entry Point:** Prompt constructed

**Flow:**
1. **Service:** WalterResponseService.generateResponse()
2. **API Call:** OpenAI Chat Completions API
   - Model: gpt-4o or gpt-4o-mini (configurable)
   - Messages: System prompt + user message
   - Temperature: 0.7 (balanced creativity/consistency)
   - Max Tokens: 500 (concise responses)
3. **Response:** AI-generated text
4. **Validation:** Check for empty/error responses
5. **Fallback:** If AI fails, return error message

**Exit Point:** AI response text generated

---

### 5. **Response Persistence**
**Entry Point:** AI response generated successfully

**Flow:**
```
1. Save to chat_messages
   - INSERT INTO chat_messages
   - Fields: chatId, userId, role="assistant", content=AI_response
   - Result: Message saved with ID

2. Evaluate for Memory Storage
   - Criteria:
     * Contains actionable insight
     * References important trading concept
     * Provides strategic guidance
     * User explicitly asks to remember
   - If yes: Create memory entry
     - Type: "observation" or "decision"
     - Importance: 4-5 (high)
     - Content: Extract key insight from response
     - Metadata: { chatId, messageId, extractedAt }

3. Update Chat Metadata
   - Increment message count
   - Update lastMessageAt timestamp
   - Check if summarization threshold reached (50 messages)
```

**Exit Point:** Response persisted, memory optionally created

---

### 6. **Response Delivery**
**Entry Point:** Response saved to database

**Flow:**
1. **API Response:** Return JSON to frontend
   ```json
   {
     "ok": true,
     "message": {
       "id": "msg_123",
       "role": "assistant",
       "content": "AI response text",
       "createdAt": "timestamp"
     }
   }
   ```

2. **Frontend Update:**
   - Replace "processing" placeholder with actual response
   - Display response in chat UI
   - Update chat message count
   - Trigger cache invalidation (React Query)

**Exit Point:** User sees AI response in chat interface

---

## Error Handling & Fallbacks

### Scenario 1: AI API Timeout/Error
- **Trigger:** OpenAI API fails or times out (>10s)
- **Response:** "I'm having trouble processing that right now. Could you rephrase your question?"
- **Logging:** Log error details for debugging
- **User Experience:** Graceful error message, suggest retry

### Scenario 2: Missing Purpose
- **Trigger:** walter_purpose table has no entry for user
- **Response:** Use default purpose
  - Default: "I'm Walter, your AI SysAdmin. I help optimize trading systems and provide strategic insights."
- **Action:** Suggest user set purpose in Goals Engine

### Scenario 3: No Memories Available
- **Trigger:** walter_memory table empty for user
- **Response:** Continue with chat history and purpose only
- **Impact:** Responses less personalized but still functional

### Scenario 4: Database Error
- **Trigger:** Failed to save message or retrieve context
- **Response:** 500 error to frontend
- **User Message:** "System error. Please try again."
- **Logging:** Full error stack trace

---

## Key Components

### Services
1. **WalterResponseService** (new)
   - `generateResponse(userId, chatId, userMessage)`
   - Orchestrates entire workflow
   - Returns AI response

2. **WalterPurposeService** (existing)
   - `getPurpose(userId)`
   - Provides purpose context

3. **WalterMemoryService** (existing)
   - `getRelevantMemories(userId, limit=5)`
   - Retrieves high-importance memories

4. **WalterChatLifecycleService** (existing)
   - `getChatHistory(chatId, limit)`
   - `getChatSummary(chatId)`
   - Provides conversation context

### API Endpoints
- `POST /api/walter/chats/:id/messages` (enhanced)
  - Receives user message
  - Triggers AI response generation
  - Returns assistant message

### Database Tables
- `chat_messages` - Stores all messages
- `walter_purpose` - User's purpose
- `walter_memory` - Persistent memories
- `trading_settings` - walterMemoryDepth setting

---

## Success Criteria

✅ **Functional:**
- User sends message → AI responds within 8 seconds
- Response includes context from purpose and memories
- Response saved to database
- Important responses create memories

✅ **Quality:**
- Responses are relevant to trading/system topics
- Off-topic questions handled gracefully
- Memory recall works (Walter remembers past conversations)

✅ **Reliability:**
- Handles API failures gracefully
- Works without purpose/memories (degraded mode)
- No data loss on errors

---

## Testing Checklist

- [ ] Send message with purpose set → Response references purpose
- [ ] Send message with memories → Response uses memory context
- [ ] Send message without purpose → Uses default purpose
- [ ] Send message without memories → Still responds coherently
- [ ] Simulate AI API timeout → Shows error message
- [ ] Ask off-topic question → Politely redirects
- [ ] Ask to remember something → Creates memory entry
- [ ] Verify response saved to chat_messages
- [ ] Verify high-importance responses create memories
- [ ] Measure response latency (<8s target)

---

## Next Steps (Implementation Order)

1. ✅ Document workflow (this file)
2. ⏳ Create prompt template
3. ⏳ Build WalterResponseService
4. ⏳ Enhance POST /api/walter/chats/:id/messages
5. ⏳ Add response persistence logic
6. ⏳ Implement error handling
7. ⏳ Test end-to-end
8. ⏳ Performance validation
9. ⏳ Architect review
