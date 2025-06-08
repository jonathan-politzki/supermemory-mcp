import React from "react"
import { Supermemory } from "supermemory"
import { nanoid } from "nanoid"
import { data, type AppLoadContext } from "react-router"
import { commitSession, getSession } from "~/session-cookies.server"
import type { Route } from "./+types/chat"

interface ChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
    memoryCreated?: boolean
}

export function meta() {
    return [
        { title: "Supermemory Chat Test" },
        { name: "description", content: "Test Supermemory with a simple chatbot" },
    ]
}

export async function loader({ request, context }: Route.LoaderArgs) {
    const cookies = request.headers.get("Cookie")
    const session = await getSession(cookies)

    if (!session.has("userId")) {
        session.set("userId", nanoid())
    }
    
    const userId = session.get("userId")!

    return data(
        {
            userId,
            messages: [] as ChatMessage[],
        },
        {
            headers: {
                "Set-Cookie": await commitSession(session, {
                    expires: new Date("9999-12-31"),
                }),
            },
        },
    )
}

export async function action({ request, context }: { request: Request; context: AppLoadContext }) {
    let userId: string
    let message: string

    if (request.headers.get("Content-Type")?.includes("application/json")) {
        const body = await request.json() as { userId: string; message: string }
        userId = body.userId
        message = body.message
    } else {
        const formData = await request.formData()
        userId = formData.get("userId") as string
        message = formData.get("message") as string
    }

    if (!userId || !message) {
        return new Response(JSON.stringify({
            error: "Missing required fields"
        }), {
            status: 400,
            headers: {
                "Content-Type": "application/json",
            },
        })
    }

    // Using API key from your Supermemory console
    const supermemory = new Supermemory({
        apiKey: "sm_zyQPm2XzEiK89W2ymSygGv_WZOclYRmnXDHIyzVPFJUpAuVnFeGzwpHBWDAIQWcszGDIgVHhjfkhGDzWObqpOTp",
    })

    try {
        // Search for relevant memories first
        const searchResults = await supermemory.search.execute({
            q: message,
            containerTags: [userId],
        })

        const relevantMemories = searchResults.results
            .map(r => r.chunks.map(c => c.content).join("\n"))
            .slice(0, 3) // Top 3 relevant memories

        // Create user message
        const userMessage: ChatMessage = {
            id: nanoid(),
            role: 'user',
            content: message,
            timestamp: new Date()
        }

        // Generate bot response based on message content and memories
        let botResponse = ""
        let memoryCreated = false

        // Simple response logic with memory integration
        if (message.toLowerCase().includes("remember") || message.toLowerCase().includes("save")) {
            // Store this as a memory
            await supermemory.memories.add({
                content: message,
                containerTags: [userId],
            })
            memoryCreated = true
            botResponse = "✅ I've saved that to your memory! I'll remember this for future conversations."
        } else if (message.toLowerCase().includes("what do you know") || message.toLowerCase().includes("recall")) {
            // Search and return memories
            if (relevantMemories.length > 0) {
                botResponse = `🧠 Here's what I remember:\n\n${relevantMemories.map((mem, i) => `${i + 1}. ${mem}`).join('\n\n')}`
            } else {
                botResponse = "🤔 I don't have any relevant memories stored yet. Try telling me something to remember!"
            }
        } else if (relevantMemories.length > 0) {
            // Use memories to provide context-aware response
            botResponse = `💭 Based on what I remember about you: ${relevantMemories[0].substring(0, 100)}...\n\nRegarding "${message}": This seems related to our previous conversations. Would you like me to remember this too?`
        } else {
            // Default responses for common messages
            if (message.toLowerCase().includes("hello") || message.toLowerCase().includes("hi")) {
                botResponse = "👋 Hello! I'm your memory-enabled chatbot. Try telling me something to remember, or ask me what I know about you!"
            } else if (message.toLowerCase().includes("test")) {
                botResponse = "🧪 Great! This is a test of the Supermemory system. I can store and retrieve memories across our conversation. Tell me something interesting to remember!"
            } else {
                botResponse = `💬 I see you said: "${message}". I can help you store this as a memory if you'd like! Just say "remember this" or ask me "what do you know about me?"`
                
                // Auto-store if it seems like important information
                if (message.split(' ').length > 5 && !message.includes('?')) {
                    await supermemory.memories.add({
                        content: `User mentioned: ${message}`,
                        containerTags: [userId],
                    })
                    memoryCreated = true
                    botResponse += "\n\n✨ I automatically saved this as it seems like useful information!"
                }
            }
        }

        const assistantMessage: ChatMessage = {
            id: nanoid(),
            role: 'assistant',
            content: botResponse,
            timestamp: new Date(),
            memoryCreated
        }

        return new Response(JSON.stringify({
            success: true,
            userMessage,
            assistantMessage,
            memoriesFound: relevantMemories.length
        }), {
            headers: {
                "Content-Type": "application/json",
            },
        })

    } catch (error) {
        console.error("Error in chat action:", error)
        return new Response(JSON.stringify({
            error: "Failed to process message"
        }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
            },
        })
    }
}

export default function Chat({ loaderData }: Route.ComponentProps) {
    if (!loaderData) {
        return <div>Loading...</div>
    }
    
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            <div className="container mx-auto max-w-4xl px-4 py-8">
                <div className="mb-8 text-center">
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400 mb-2">
                        Supermemory Chatbot Test
                    </h1>
                    <p className="text-white/60">
                        Test memory storage and retrieval with this AI chatbot
                    </p>
                    <p className="text-xs text-white/40 mt-1">
                        User ID: {loaderData.userId}
                    </p>
                </div>

                <ChatInterface userId={loaderData.userId} />
            </div>
        </div>
    )
}

function ChatInterface({ userId }: { userId: string }) {
    const [messages, setMessages] = React.useState<ChatMessage[]>([])
    const [input, setInput] = React.useState("")
    const [isLoading, setIsLoading] = React.useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || isLoading) return

        const userMessage: ChatMessage = {
            id: nanoid(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date()
        }

        setMessages(prev => [...prev, userMessage])
        setInput("")
        setIsLoading(true)

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    userId: userId,
                    message: input.trim()
                })
            })

            const result = await response.json() as any
            
            if (result.success) {
                // Convert timestamp strings back to Date objects
                const assistantMessage = {
                    ...result.assistantMessage,
                    timestamp: new Date(result.assistantMessage.timestamp)
                }
                setMessages(prev => [...prev, assistantMessage])
            } else {
                setMessages(prev => [...prev, {
                    id: nanoid(),
                    role: 'assistant',
                    content: `❌ Error: ${result.error}`,
                    timestamp: new Date()
                }])
            }
        } catch (error) {
            setMessages(prev => [...prev, {
                id: nanoid(),
                role: 'assistant',
                content: "❌ Failed to send message",
                timestamp: new Date()
            }])
        } finally {
            setIsLoading(false)
        }
    }

    React.useEffect(() => {
        // Add welcome message
        setMessages([{
            id: nanoid(),
            role: 'assistant',
            content: "👋 Welcome! I'm powered by Supermemory and can remember our conversations. Try saying:\n\n• \"Remember that I love TypeScript\"\n• \"What do you know about me?\"\n• \"Test memory storage\"",
            timestamp: new Date()
        }])
    }, [])

    return (
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            {/* Chat Messages */}
            <div className="h-96 overflow-y-auto p-6 space-y-4">
                {messages.map((message) => (
                    <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                            message.role === 'user' 
                                ? 'bg-blue-600 text-white ml-4' 
                                : 'bg-slate-800 text-white/90 mr-4'
                        }`}>
                            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                            {message.memoryCreated && (
                                <div className="text-xs text-blue-300 mt-1">💾 Memory created</div>
                            )}
                            <div className="text-xs opacity-50 mt-1">
                                {new Date(message.timestamp).toLocaleTimeString()}
                            </div>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-slate-800 text-white/90 px-4 py-2 rounded-2xl mr-4">
                            <div className="text-sm">Thinking...</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="p-6 border-t border-white/10">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1 bg-slate-950/80 border border-white/10 focus:border-blue-500/50 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none transition-all duration-300"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium transition-all duration-300"
                    >
                        Send
                    </button>
                </div>
            </form>
        </div>
    )
} 