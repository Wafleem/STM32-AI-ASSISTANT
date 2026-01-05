import { useState, useEffect, useRef } from 'react'
import './App.css'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface PinAllocations {
  [pin: string]: {
    function: string
    device?: string
    notes?: string
  }
}

interface ChatResponse {
  response: string
  sessionId: string
  allocations: PinAllocations
  sources: {
    pins: any[]
    knowledge: any[]
  }
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pinAllocations, setPinAllocations] = useState<PinAllocations>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load session ID from localStorage on mount
  useEffect(() => {
    const fetchSessionAllocations = async (sid: string) => {
      try {
        const response = await fetch(`https://stm32-ai-agent.wafleem.workers.dev/api/session/${sid}`)
        if (response.ok) {
          const data = await response.json()
          setPinAllocations(data.allocations || {})
        }
      } catch (error) {
        console.error('Failed to fetch session allocations:', error)
      }
    }

    const savedSessionId = localStorage.getItem('stm32_session_id')
    if (savedSessionId) {
      setSessionId(savedSessionId)
      // Optionally fetch current allocations
      fetchSessionAllocations(savedSessionId)
    }
  }, [])

  const sendMessageWithText = async (text: string) => {
    if (!text.trim() || loading) return

    const userMessage = text.trim()
    setInput('')
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage
    }])
    setLoading(true)

    try {
      const response = await fetch('https://stm32-ai-agent.wafleem.workers.dev/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          sessionId: sessionId
        })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: error.error || 'Error: Could not get response'
        }])
        return
      }

      const data: ChatResponse = await response.json()
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response
      }])

      // Save session ID if this is the first message
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId)
        localStorage.setItem('stm32_session_id', data.sessionId)
      }

      // Update pin allocations
      if (data.allocations) {
        setPinAllocations(data.allocations)
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Error: Could not get response'
      }])
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    sendMessageWithText(input)
  }

  const clearSession = () => {
    setSessionId(null)
    setPinAllocations({})
    setMessages([])
    localStorage.removeItem('stm32_session_id')
  }

  const removePin = async (pin: string) => {
    if (!sessionId) return

    const previousAllocations = { ...pinAllocations }

    // Optimistic update
    setPinAllocations(prev => {
      const updated = { ...prev }
      delete updated[pin]
      return updated
    })

    try {
      const response = await fetch(`https://stm32-ai-agent.wafleem.workers.dev/api/session/${sessionId}/allocations/${pin}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        // Rollback on error
        setPinAllocations(previousAllocations)
        console.error('Failed to remove pin')
        return
      }

      const data = await response.json()
      setPinAllocations(data.allocations)
    } catch (error) {
      // Rollback on error
      setPinAllocations(previousAllocations)
      console.error('Failed to remove pin:', error)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const sendExampleQuestion = (question: string) => {
    setInput(question)
    sendMessageWithText(question)
  }

  return (
    <div className="app">
      <header>
        <h1>STM32F103C8T6 Assistant</h1>
        <p>I'll help you with questions about STM32F103C8T6 chip</p>
        <div className="session-info">
          {sessionId && <span className="session-badge">Session Active</span>}
          <button
            onClick={clearSession}
            className="clear-session-btn"
            aria-label="Reset session and clear pin allocations"
          >
            Reset Session
          </button>
        </div>
      </header>

      <div className="main-content">
        {Object.keys(pinAllocations).length > 0 && (
          <div className="pin-allocations-sidebar">
            <h3>Pin Allocations</h3>
            <div className="allocations-list">
              {Object.entries(pinAllocations).map(([pin, info]) => (
                <div key={pin} className="allocation-item">
                  <div className="pin-header">
                    <div className="pin-header-left">
                      <span className="pin-name">{pin}</span>
                      <span className="pin-function">{info.function}</span>
                    </div>
                    <button
                      className="remove-pin-btn"
                      onClick={() => removePin(pin)}
                      title="Remove this pin allocation"
                    >
                      ×
                    </button>
                  </div>
                  {info.device && (
                    <div className="pin-device">
                      <span className="device-label">Device:</span> {info.device}
                    </div>
                  )}
                  {info.notes && (
                    <div className="pin-notes">
                      {info.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="chat-container">
        {messages.length === 0 && (
          <div className="welcome">
            <p>Try asking:</p>
            <ul>
              <li>
                <button
                  onClick={() => sendExampleQuestion("What pins can I use for I2C?")}
                  className="example-question"
                  aria-label="Ask: What pins can I use for I2C?"
                >
                  "What pins can I use for I2C?"
                </button>
              </li>
              <li>
                <button
                  onClick={() => sendExampleQuestion("How do I configure the clock to 72MHz?")}
                  className="example-question"
                  aria-label="Ask: How do I configure the clock to 72MHz?"
                >
                  "How do I configure the clock to 72MHz?"
                </button>
              </li>
              <li>
                <button
                  onClick={() => sendExampleQuestion("Which pins are 5V tolerant?")}
                  className="example-question"
                  aria-label="Ask: Which pins are 5V tolerant?"
                >
                  "Which pins are 5V tolerant?"
                </button>
              </li>
              <li>
                <button
                  onClick={() => sendExampleQuestion("How do I connect an MPU6050?")}
                  className="example-question"
                  aria-label="Ask: How do I connect an MPU6050?"
                >
                  "How do I connect an MPU6050?"
                </button>
              </li>
            </ul>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}

        {loading && (
          <div className="message assistant">
            <div className="message-content loading">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about STM32F103C8T6..."
          disabled={loading}
          aria-label="Ask a question about STM32F103C8T6"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default App