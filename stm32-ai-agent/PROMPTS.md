# Design Prompts and Solutions

## Preface

This project was designed and developed primarily through human decision-making and architectural planning. While AI-assisted coding tools were used to boost productivity and accelerate implementation, all major design choices, architectural decisions, and feature specifications were made by the human developer.

The AI served as a productivity tool - similar to how a power drill assists a carpenter but doesn't design the furniture. The human developer:
- Identified all problems and requirements
- Made all architectural and design decisions
- Provided detailed specifications for implementations
- Reviewed and validated all code changes
- Directed the overall project vision and user experience

AI-assisted coding was used under careful human supervision to:
- Generate boilerplate code based on specifications
- Implement features according to detailed requirements
- Suggest solutions to technical challenges
- Accelerate repetitive coding tasks
- Debug and troubleshoot issues

This document contains the key prompts used during development to leverage AI assistance for various parts of the project. Each prompt represents a specific problem identified by the human developer, with solutions implemented under human review and guidance.

---

## About This Document

This document contains key issues, prompts, and solutions that guided the development of the STM32 AI Assistant project. Each entry shows the problem faced, the prompt/question asked, and the solution approach taken.

---

## Session State Management

### Issue Faced
Cloudflare Workers are stateless by design, but the application needed to track pin allocations across multiple user requests within a session.

### Prompt to AI
"How might I make it so that this backend using a cloudflare worker has 'state' to try to remember what pins a user is allocating to where in a single session?"

### Solution Provided
Implemented D1-based session system with:
- Unique session ID generation using crypto.getRandomValues()
- D1 SQLite database for persistent storage
- 1-hour session timeout with automatic cleanup
- localStorage integration on frontend for session restoration
- Session endpoints for CRUD operations

---

## Pin Allocation Sidebar Information

### Issue Faced
The pin allocation sidebar only showed basic pin-to-pin mappings, lacking context about which device the connection was for and important electrical requirements.

### Prompt to AI
"The pin allocations sidebar can be made a little larger and needs to restrict the info on it to be more helpful. It should say not only which pin goes to the pin on the chip (ex: SDA to PB7) but also where the SDA is coming from (like the XBee or MPU sensor). Also, the allocations tab tries to shove in the notes section from the pins, but it gets cut off, it should include notes about needed resistor connections/current considerations and expand the box if needed."

### Solution Provided
Enhanced sidebar design with:
- Expanded width to 360px for better readability
- Structured data model with function, device, and notes fields
- Visual hierarchy: pin name (bold), function badge, device label
- Dedicated notes section with distinct styling
- Dynamic expansion to accommodate longer content
- Color-coded border and warning indicators

---

## AI Hallucination Issues

### Issue Faced
AI was inventing device names (e.g., "GY-521" instead of user's "MPU6050"), swapping devices between pins, and showing pins connected to themselves.

### Prompt to AI
"It is hallucinating devices that were not mentioned. And sometimes the pin shows up as connected to itself? I asked it to connect a MPU6050 and an LED, and it actually swapped the devices."

### Solution Provided
Implemented structured output format to eliminate parsing ambiguity:
```
---PIN_ALLOCATIONS---
PIN: <pin> | FUNCTION: <function> | DEVICE: <device> | NOTES: <notes>
---END_ALLOCATIONS---
```
- Delimiter-based format prevents misinterpretation
- Pipe-separated fields for clear boundaries
- Parser prioritizes structured blocks over prose
- Removes structured block from user-visible response
- Significantly reduced hallucinations

---

## Pin Reuse and Conflicts

### Issue Faced
When adding new devices, the AI attempted to overwrite existing pin allocations without warning.

### Prompt to AI
"When I added an XBee pro into it, it tried to overwrite one pin of the LEDs, it needs to make sure that it does not overwrite previous pin assignments unless asked."

### Solution Provided
Multi-layered conflict prevention:
- Strong prompt instructions: "DO NOT REUSE THESE PINS"
- Current allocations injected into system prompt grouped by device
- Reassignment detection: when same device appears with new pins, old ones are removed
- Incomplete device detection (e.g., I2C with only SCL allocated)
- Delete endpoint for manual pin removal

---

## Conversation Memory

### Issue Faced
The chatbot couldn't remember context from previous messages in the conversation, making follow-up questions impossible.

### Prompt to AI
"The chatbot seems to not have good memory, if I am asking follow up questions, it does not remember what the last thing was. For example, I asked about what pins would work with an LED, and it gave suggestions. Then I told it to choose one for me and then it forgot about the LED."

### Solution Provided
Conversation history system:
- Added `conversation_history` column to sessions table
- Store last 100 messages per session (50 user/assistant exchanges)
- Send last 30 messages to AI for context (15 exchanges)
- Messages stored as JSON array with role and content
- Balances token costs with sufficient context
- Updated after each exchange

---

## Hardware Assumption Without Asking

### Issue Faced
When users asked about sensors, the AI automatically assumed specific breakout boards without confirming what hardware the user actually had.

### Prompt to AI
"When I ask about an MPU 6050, it tried to automatically use a breakout board GY-521 with it, which is fine, but it should ask the user first if they want that breakout board."

### Solution Provided
Two-step confirmation workflow:
- **Step 1**: Ask which specific hardware/breakout board they have
- Provide only generic chip information initially
- Do NOT output pin allocations yet
- **Step 2**: After user confirms their hardware
- Provide specific instructions for that exact module
- Include pin allocations in structured format
- Respects user autonomy while remaining helpful

---

## Informational vs Connection Questions

### Issue Faced
When users asked informational questions like "Which pins are 5V tolerant?", the AI allocated all mentioned pins even though no device was being connected.

### Prompt to AI
"I'm noticing a new bug, whenever asking just a basic informational question (like which pins are 5v tolerant) the bot gives the right answer in text, but then starts to put all those pins they talked about into the allocation."

### Solution Provided
Intent detection system:
- Informational keywords: "which pins", "what pins", "are", "tolerant", "can i", "list"
- Connection keywords: "connect", "wire", "hook up", "attach", "interface"
- Device pattern matching: requires actual device name (MPU6050, LED, etc.)
- Only allocate when: connection intent + device name detected
- Skip allocation entirely for informational queries

---

## Missing Allocations After Instructions

### Issue Faced
AI would provide connection instructions but not output the allocation block, especially when no clarifying questions were needed.

### Prompt to AI
"It still just gives instructions, it does not do the allocation. Especially if it does not need to ask the user any questions, it just outputs the answer without the allocation."

### Solution Provided
Strengthened allocation requirements in prompt:
- Moved allocation instructions to top of system prompt (CRITICAL RULE)
- Added reminder at end before generating answer
- Made allocation block MANDATORY for all device connections
- Provided full conversation examples showing when to allocate
- Clear distinction: informational questions = no allocation, connection requests = allocation required

---

## RAG for Device Patterns

### Issue Faced
AI was guessing at device connection patterns, leading to incorrect pin suggestions and missing important requirements like pull-up resistors.

### Prompt to AI
"Would it make sense to make a kind of temp database for the pin allocations? That way we can reduce the hallucinations the same way RAG with the datasheet and reference sheet use a database."

### Solution Provided
Device patterns reference database:
- Created `device_patterns` table with 15+ common devices
- Fields: device_name, interface_type, default_pins (JSON), requirements, notes, keywords
- Categories: I2C devices, SPI devices, UART devices, GPIO devices, ADC devices
- RAG search on keywords and device names
- Inject matching patterns into system prompt as reference
- Provides correct defaults: pin mappings, resistor values, voltage levels, I2C addresses

---

## Dual Approach: RAG + Structured API

### Issue Faced
RAG provided reference data but allocations still relied on text parsing which could be error-prone.

### Prompt to AI
"Can we implement both?" (referring to RAG database and structured allocation API)

### Solution Provided
Attempted dual implementation:
- **RAG component**: Reference database search for known device patterns
- **Function calling component**: `allocate_pins` tool with JSON schema
- **3-tier fallback**: Tool calls → structured text blocks → regex parsing

**Note**: Function calling was later disabled because Llama 3.1 8B model called tools too eagerly even for informational questions. Reverted to structured text blocks as primary method with RAG support.

---

## Layout Issues After Adding Sidebar

### Issue Faced
After adding the pin allocations sidebar, the input text box moved to be horizontally aligned on the right side instead of staying at the bottom.

### Prompt to AI
"The input text box got moved to be aligned horizontally on the right side! Put it back on the bottom of the page!"

### Solution Provided
CSS layout fix:
- Moved input-container outside of main-content flex container
- main-content uses flex-row for sidebar + chat
- input-container stays outside as separate bottom element
- Maintains proper vertical stacking of header → content → input

---

## Clickable Example Questions

### Issue Faced
Users saw example questions on startup but had to manually type them out.

### Prompt to AI
"I want to make the example questions that appear upon startup clickable so that when the user clicks it it asks that question for them."

### Solution Provided
Interactive example questions:
- Added `sendExampleQuestion` function that sets input and triggers send
- onClick handlers on each example list item
- Auto-fills input field and submits after 10ms delay
- Improves UX by reducing friction for first-time users

---

## Key Design Principles

Throughout development, these principles guided the solutions:

1. **User Autonomy**: Always ask before making assumptions about hardware or configuration
2. **Progressive Enhancement**: Start with simple solutions, add structure when issues arise
3. **Fail Gracefully**: Implement multiple fallbacks for critical features
4. **Context is King**: Use RAG + conversation history for informed responses
5. **Visual Feedback**: Make state visible and trackable through UI
6. **Stateless with State**: Bridge stateless architecture with persistent storage
7. **Mobile-Responsive**: Adapt layouts for different screen sizes

---

## Evolution of Solutions

### Text Parsing → Structured Output → Function Calling

**Problem**: Regex parsing of AI prose was fragile
- Devices got swapped between pins
- Hallucinated device names
- Pins shown as connected to themselves

**Evolution**:
1. Started with regex parsing of natural language
2. Moved to delimiter-based structured blocks (`---PIN_ALLOCATIONS---`)
3. Attempted function calling with tool definitions
4. Reverted to structured blocks (model called tools too eagerly)

**Lesson**: Structured output is more reliable than parsing prose, but the model must be capable of using it correctly.

### Assumptions → Confirmation

**Problem**: AI made "helpful" assumptions that felt presumptuous

**Evolution**:
1. Initially assumed common breakout boards (GY-521 for MPU6050)
2. User feedback indicated this felt wrong
3. Implemented 2-step confirmation workflow

**Lesson**: Even reasonable assumptions can violate user autonomy. Better to ask first.

### Stateless → Stateful

**Problem**: Workers are stateless but users expect persistent state

**Evolution**:
1. Initially no state tracking across requests
2. Implemented D1 database for session persistence
3. Added localStorage for client-side session restoration

**Lesson**: Architecture constraints can be worked around with the right storage layer.

---

## Future Directions

Potential improvements based on current patterns:

1. **Code Generation**: Generate actual C/Arduino code for confirmed device setups
2. **Visual Pinout Diagram**: Interactive diagram showing current allocations
3. **Export Functionality**: Download allocations as CSV, JSON, or config files
4. **Conflict Resolution UI**: Interactive prompt when pin conflicts detected
5. **Device Templates**: Pre-configured setups for common projects (weather station, robot, etc.)
6. **Collaborative Sessions**: Shareable session URLs for team collaboration
7. **Undo/Redo**: Version history for pin allocations

---

## Conclusion

This project evolved through an iterative process of:
1. Identifying issues through real usage
2. Asking clear questions about desired behavior
3. Implementing solutions that balance simplicity with functionality
4. Refining based on feedback

The key success factor was maintaining focus on actual user needs rather than theoretical features. Each prompt in this document represents a real problem that needed solving, and each solution was validated through testing.

Good software design comes from listening to users, understanding their problems, and implementing solutions that make their tasks easier.
