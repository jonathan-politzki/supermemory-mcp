import { Supermemory } from "supermemory"
import { nanoid } from "nanoid"

interface ChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
    memoryCreated?: boolean
}

export async function handleChatAPI(request: Request): Promise<Response> {
    // Handle CORS
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        })
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    try {
        const body = await request.json() as { userId: string; message: string }
        const { userId, message } = body

        if (!userId || !message) {
            return new Response(JSON.stringify({
                error: "Missing required fields"
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            })
        }

        // Using API key from your Supermemory console
        const supermemory = new Supermemory({
            apiKey: "sm_zyQPm2XzEiK89W2ymSygGv_WZOclYRmnXDHIyzVPFJUpAuVnFeGzwpHBWDAIQWcszGDIgVHhjfkhGDzWObqpOTp",
        })

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
                'Access-Control-Allow-Origin': '*',
            },
        })

    } catch (error) {
        console.error("Error in chat API:", error)
        return new Response(JSON.stringify({
            error: "Failed to process message"
        }), {
            status: 500,
            headers: { 
                "Content-Type": "application/json",
                'Access-Control-Allow-Origin': '*',
            },
        })
    }
} 