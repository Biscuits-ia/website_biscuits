<script lang="ts">
  import { afterUpdate } from 'svelte';

  type Message = {
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  };

  export let assistant: "support" | "dev" | "sales" = "support";
  export let position: "bottom-right" | "bottom-left" = "bottom-right";

  let isOpen = false;
  let messages: Message[] = [];
  let input = "";
  let conversationId: number | null = null;
  let loading = false;
  let hasUnread = false;
  let messagesEndRef: HTMLDivElement;
  let inputRef: HTMLInputElement;

  const scrollToBottom = () => {
    messagesEndRef?.scrollIntoView({ behavior: "smooth" });
  };

  afterUpdate(() => {
    scrollToBottom();
  });

  $: if (isOpen) {
    inputRef?.focus();
    hasUnread = false;
  }

  const sendMessage = async () => {
  if (!input.trim() || loading) return;

  const userMessage = input.trim();
  messages = [
    ...messages,
    { 
      role: "user", 
      content: userMessage,
      timestamp: new Date().toISOString()
    },
  ];

  input = "";
  loading = true;

  try {
    // ✅ Appel direct à Laravel (change l'URL selon ton environnement)
    const laravelUrl = import.meta.env.PUBLIC_LARAVEL_API_URL;
    
    const res = await fetch(`${laravelUrl}/api/ai/${assistant}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        message: userMessage,
        conversation_id: conversationId,
      }),
    });

    if (!res.ok) {
      throw new Error(`Erreur ${res.status}`);
    }

    const data = await res.json();
    conversationId = data.conversation_id;

    messages = [
      ...messages,
      { 
        role: "assistant", 
        content: data.reply,
        timestamp: new Date().toISOString()
      },
    ];

    if (!isOpen) {
      hasUnread = true;
    }

  } catch (e) {
    messages = [
      ...messages,
      {
        role: "assistant",
        content: "❌ Désolé, une erreur est survenue. Réessayez dans quelques instants.",
        timestamp: new Date().toISOString()
      },
    ];
  } finally {
    loading = false;
  }
};

  const assistantConfig = {
    support: { name: "Assistant Support", emoji: "🥞" },
    dev: { name: "Assistant Dev", emoji: "💻" },
    sales: { name: "Assistant Commercial", emoji: "💼" },
  };

  $: config = assistantConfig[assistant];
</script>

<style>
  :global(.chatbot-button) {
    position: fixed;
    bottom: 24px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: linear-gradient(135deg, oklch(60.201% 0.11053 58.986) 0, oklch(65.92% 0.153 34.70) 100%);
    border: none;
    cursor: pointer;
    box-shadow: 0 8px 24px oklch(66.067% 0.15171 35.164 / 0.315);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 9998;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.chatbot-button.position-right) {
    right: 24px;
  }

  :global(.chatbot-button.position-left) {
    left: 24px;
  }

  :global(.chatbot-button:hover) {
    transform: scale(1.1);
    box-shadow: 0 12px 32px oklch(66.067% 0.15171 35.164 / 0.315);
  }

  :global(.chatbot-button:active) {
    transform: scale(0.95);
  }

  .chatbot-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 18px;
    height: 18px;
    background: oklch(37.619% 0.07877 44.64);
    border-radius: 50%;
    border: 2px solid white;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
  }

  .chatbot-popup {
    position: fixed;
    bottom: 100px;
    width: 400px;
    max-width: calc(100vw - 48px);
    height: 600px;
    max-height: calc(100vh - 140px);
    background: #1a1a1a;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .chatbot-popup.position-right {
    right: 24px;
  }

  .chatbot-popup.position-left {
    left: 24px;
  }

  .chatbot-header {
    background: linear-gradient(135deg, oklch(60.201% 0.11053 58.986) 0%, oklch(37.619% 0.07877 44.64) 100%);
    padding: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .chatbot-messages {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    background: #0f0f0f;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .chatbot-messages::-webkit-scrollbar {
    width: 6px;
  }

  .chatbot-messages::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  .message {
    display: flex;
    gap: 10px;
    animation: slideIn 0.3s ease;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .message.user {
    flex-direction: row-reverse;
  }

  .message-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 25px;
  }

  .message.user .message-avatar {
    background: linear-gradient(135deg, oklch(37.619% 0.07877 44.64) 0%, oklch(60.201% 0.11053 58.986) 100%);
  }

  .message.assistant .message-avatar {
    background: rgba(255, 255, 255, 0.1);
  }

  .message-bubble {
    max-width: 75%;
    padding: 12px 16px;
    border-radius: 18px;
    font-size: 14px;
    line-height: 1.5;
    word-wrap: break-word;
  }

  .message.user .message-bubble {
    background: linear-gradient(135deg, oklch(37.619% 0.07877 44.64) 0%, oklch(83.69% 0.164 84.43) 100%);
    color: white;
    border-bottom-right-radius: 4px;
  }

  .message.assistant .message-bubble {
    background: rgba(255, 255, 255, 0.05);
    color: #e5e7eb;
    border-bottom-left-radius: 4px;
  }

  .typing-dots {
    display: flex;
    gap: 4px;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 18px;
  }

  .typing-dot {
    width: 8px;
    height: 8px;
    background: #6b7280;
    border-radius: 50%;
    animation: typing 1.4s infinite;
  }

  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes typing {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.7; }
    30% { transform: translateY(-8px); opacity: 1; }
  }

  .chatbot-input {
    padding: 16px;
    background: #1a1a1a;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  @media (max-width: 480px) {
    .chatbot-popup {
      bottom: 90px;
      width: calc(100vw - 24px);
      height: 500px;
    }
    .chatbot-popup.position-right {
      right: 12px;
    }
    .chatbot-popup.position-left {
      left: 12px;
    }
    :global(.chatbot-button) {
      bottom: 16px;
    }
    :global(.chatbot-button.position-right) {
      right: 16px;
    }
    :global(.chatbot-button.position-left) {
      left: 16px;
    }
  }
</style>

<!-- Bouton flottant -->
<button
  on:click={() => isOpen = !isOpen}
  class="chatbot-button position-{position === 'bottom-right' ? 'right' : 'left'}"
  aria-label="Ouvrir le chat"
>
  {#if hasUnread && !isOpen}
    <span class="chatbot-badge"></span>
  {/if}
  
  <svg 
    style="width: 28px; height: 28px; color: white; transform: {isOpen ? 'rotate(90deg)' : 'rotate(0)'}; transition: transform 0.3s;" 
    fill="none" 
    stroke="currentColor" 
    viewBox="0 0 24 24"
  >
    {#if isOpen}
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M6 18L18 6M6 6l12 12" />
    {:else}
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    {/if}
  </svg>
</button>

<!-- Popup -->
{#if isOpen}
  <div class="chatbot-popup position-{position === 'bottom-right' ? 'right' : 'left'}">
    
    <!-- Header -->
    <div class="chatbot-header">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 44px; height: 44px; background: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px;">
          {config.emoji}
        </div>
        <div>
          <h3 style="color: white; font-size: 16px; font-weight: 600; margin: 0;">
            {config.name}
          </h3>
          <p style="color: rgba(255, 255, 255, 0.8); font-size: 12px; display: flex; align-items: center; gap: 6px; margin-top: 2px;">
            <span style="width: 6px; height: 6px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite;"></span>
            En ligne
          </p>
        </div>
      </div>
      <button
        on:click={() => isOpen = false}
        style="background: rgba(255, 255, 255, 0.1); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;"
        aria-label="Fermer le chat"
      >
        <svg style="width: 18px; height: 18px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Messages -->
    <div class="chatbot-messages">
      {#if messages.length === 0}
        <div style="text-align: center; padding: 40px 20px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div style="font-size: 64px; margin-bottom: 16px;">👋</div>
          <p style="color: #9ca3af; font-size: 15px; line-height: 1.5;">
            Bonjour ! Comment puis-je vous aider aujourd'hui ?
          </p>
        </div>
      {/if}

      {#each messages as m}
        <div class="message {m.role}">
          <div class="message-avatar">
            <p>{m.role === "user" ? "Moi" : "🤖"}</p>
          </div>
          <div class="message-bubble">
            {m.content}
          </div>
        </div>
      {/each}

      {#if loading}
        <div class="message assistant">
          <div class="message-avatar">🤖</div>
          <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
        </div>
      {/if}

      <div bind:this={messagesEndRef}></div>
    </div>

    <!-- Input -->
    <div class="chatbot-input">
      <form 
        on:submit|preventDefault={sendMessage}
        style="display: flex; gap: 8px; align-items: center;"
      >
        <input
          bind:this={inputRef}
          type="text"
          bind:value={input}
          placeholder="Écrivez votre message..."
          maxlength={4000}
          disabled={loading}
          style="flex: 1; padding: 12px 16px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; color: white; font-size: 14px; outline: none;"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style="width: 44px; height: 44px; background: {loading ? '#4B5563' : 'linear-gradient(135deg, oklch(60.201% 0.11053 58.986) 0%, oklch(65.92% 0.153 34.70) 100%)'}; border: none; border-radius: 12px; cursor: {loading ? 'not-allowed' : 'pointer'}; display: flex; align-items: center; justify-content: center; opacity: {(loading || !input.trim()) ? 0.5 : 1};"
          aria-label="Envoyer le message"
        >
          <svg style="width: 20px; height: 20px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
      <p style="text-align: center; margin-top: 8px; font-size: 11px; color: #6b7280;">
        Propulsé par BiscuitsAI
      </p>
    </div>
  </div>
{/if}