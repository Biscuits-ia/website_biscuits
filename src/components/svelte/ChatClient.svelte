<script lang="ts">
  import { afterUpdate } from 'svelte';

  type MessageRole = "user" | "assistant";

  /**
   * Type d'assistant disponible
   */
  type AssistantType = "support" | "dev" | "sales";

  /**
   * Position du chatbot sur l'écran
   */
  type ChatPosition = "bottom-right" | "bottom-left";

  /**
   * Structure d'un message dans la conversation
   */
  interface Message {
    readonly role: MessageRole;
    readonly content: string;
    readonly timestamp: string;
    readonly id?: string;
  }

  /**
   * Configuration d'un assistant
   */
  interface AssistantConfig {
    readonly name: string;
    readonly emoji: string;
    readonly description: string;
  }

  /**
   * Réponse de l'API Laravel - Succès
   */
  interface ApiSuccessResponse {
    readonly success: true;
    readonly conversation_id: number;
    readonly reply: string;
    readonly message_count: number;
  }

  /**
   * Réponse de l'API Laravel - Erreur
   */
  interface ApiErrorResponse {
    readonly success?: false;
    readonly error: string;
    readonly details?: Record<string, string[]>;
    readonly retry_after?: number;
  }

  type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

  interface ApiRequestPayload {
    readonly message: string;
    readonly conversation_id: number | null;
  }


  export let assistant: AssistantType = "support";
  export let position: ChatPosition = "bottom-right";
  export let maxMessageLength: number = 4000;
  export let requestTimeout: number = 60000; // 60 secondes
  export let enableDebug: boolean = false;

  // ============================================================================
  // STATE
  // ============================================================================

  let isOpen: boolean = false;
  let messages: Message[] = [];
  let input: string = "";
  let conversationId: number | null = null;
  let loading: boolean = false;
  let hasUnread: boolean = false;
  let messagesEndRef: HTMLDivElement;
  let inputRef: HTMLInputElement;
  let errorRetryCount: number = 0;

  // ============================================================================
  // CONSTANTES
  // ============================================================================

  const MAX_RETRY_COUNT = 3;
  const EMPTY_MESSAGE_ERROR = "Le message ne peut pas être vide";
  const MESSAGE_TOO_LONG_ERROR = `Le message ne peut pas dépasser ${maxMessageLength} caractères`;

  /**
   * Configuration des assistants disponibles
   */
  const assistantConfigMap: Record<AssistantType, AssistantConfig> = {
    support: {
      name: "Assistant Support",
      emoji: "🥞",
      description: "Aide technique et questions générales"
    },
    dev: {
      name: "Assistant Dev",
      emoji: "💻",
      description: "Support développement et intégration"
    },
    sales: {
      name: "Assistant Commercial",
      emoji: "💼",
      description: "Informations produits et devis"
    },
  } as const;

  // ============================================================================
  // COMPUTED (Reactive Statements)
  // ============================================================================

  $: currentConfig = assistantConfigMap[assistant];
  $: isInputValid = input.trim().length > 0 && input.length <= maxMessageLength;
  $: canSendMessage = isInputValid && !loading;

  $: if (isOpen) {
    inputRef?.focus();
    hasUnread = false;
  }

  // ============================================================================
  // FONCTIONS UTILITAIRES
  // ============================================================================

  /**
   * Récupère l'URL de l'API en supprimant le slash final
   */
  const getApiUrl = (): string => {
    const baseUrl = import.meta.env.PUBLIC_LARAVEL_API_URL || 'http://localhost:8000';
    return baseUrl.replace(/\/$/, '');
  };

  /**
   * Génère un ID unique pour un message
   */
  const generateMessageId = (): string => {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  /**
   * Crée un message avec les métadonnées complètes
   */
  const createMessage = (role: MessageRole, content: string): Message => ({
    id: generateMessageId(),
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  /**
   * Ajoute un message à la liste
   */
  const addMessage = (message: Message): void => {
    messages = [...messages, message];
  };

  /**
   * Affiche un message d'erreur dans le chat
   */
  const showErrorInChat = (errorMessage: string): void => {
    addMessage(createMessage("assistant", errorMessage));
  };

  /**
   * Log de debug (seulement si activé)
   */
  const debugLog = (context: string, data: unknown): void => {
    if (enableDebug) {
      console.log(`[ChatClient:${context}]`, data);
    }
  };

  /**
   * Valide le message avant envoi
   */
  const validateMessage = (message: string): {
    isValid: boolean;
    error: string | null;
  } => {
    const trimmed = message.trim();

    if (trimmed.length === 0) {
      return { isValid: false, error: EMPTY_MESSAGE_ERROR };
    }

    if (message.length > maxMessageLength) {
      return { isValid: false, error: MESSAGE_TOO_LONG_ERROR };
    }

    return { isValid: true, error: null };
  };

  /**
   * Gère les erreurs HTTP et retourne un message approprié
   */
  const handleHttpError = async (
    response: Response
  ): Promise<string> => {
    let errorData: Partial<ApiErrorResponse> = {};

    try {
      errorData = await response.json();
    } catch {
      debugLog('JSON parse error', 'Could not parse error response');
    }

    switch (response.status) {
      case 429:
        const retryAfter = errorData.retry_after 
          ? Math.ceil(errorData.retry_after / 60) 
          : 1;
        return errorData.error || `Trop de requêtes. Réessayez dans ${retryAfter} minute(s).`;

      case 422:
        return errorData.details?.message?.[0] || "Validation échouée";

      case 403:
        return "Accès non autorisé à cette conversation";

      case 404:
        return "La conversation n'existe pas";

      case 500:
        return "Erreur serveur. Veuillez réessayer.";

      default:
        return errorData.error || `Erreur ${response.status}`;
    }
  };

  /**
   * Type guard pour vérifier si la réponse est un succès
   */
  const isSuccessResponse = (
    response: ApiResponse
  ): response is ApiSuccessResponse => {
    return 'success' in response && response.success === true;
  };

  /**
   * Scroll automatique vers le bas
   */
  const scrollToBottom = (): void => {
    messagesEndRef?.scrollIntoView({ behavior: "smooth" });
  };

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  afterUpdate(() => {
    scrollToBottom();
  });

  // ============================================================================
  // ACTIONS PRINCIPALES
  // ============================================================================

  /**
   * Envoie un message à l'API
   */
  const sendMessage = async (): Promise<void> => {
    // 1) Validation
    const validation = validateMessage(input);
    if (!validation.isValid) {
      showErrorInChat(validation.error!);
      return;
    }

    if (loading) return;

    const userMessage = input.trim();
    
    // 2) Ajouter le message utilisateur
    addMessage(createMessage("user", userMessage));
    input = "";
    loading = true;

    debugLog('sendMessage', {
      assistant,
      conversationId,
      messageLength: userMessage.length,
    });

    try {
      const apiUrl = getApiUrl();
      
      // 3) Configuration de la requête avec timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

      const payload: ApiRequestPayload = {
        message: userMessage,
        conversation_id: conversationId,
      };

      // 4) Appel API
      const response = await fetch(`${apiUrl}/api/ai/${assistant}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 5) Gestion des erreurs HTTP
      if (!response.ok) {
        const errorMessage = await handleHttpError(response);
        throw new Error(errorMessage);
      }

      // 6) Parse de la réponse
      const data = await response.json() as ApiResponse;

      debugLog('API Response', data);

      // 7) Vérification du type de réponse
      if (!isSuccessResponse(data)) {
        throw new Error(data.error || "Une erreur est survenue");
      }

      // 8) Mise à jour de l'état
      conversationId = data.conversation_id;
      addMessage(createMessage("assistant", data.reply));

      // 9) Notification si chat fermé
      if (!isOpen) {
        hasUnread = true;
      }

      // 10) Reset du compteur d'erreurs
      errorRetryCount = 0;

    } catch (error: unknown) {
      errorRetryCount++;
      
      debugLog('Error', {
        error,
        retryCount: errorRetryCount,
        maxRetries: MAX_RETRY_COUNT,
      });

      let errorMessage = "❌ Désolé, une erreur est survenue.";

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = "⏱️ Délai d'attente dépassé. Veuillez réessayer.";
        } else {
          errorMessage = `❌ ${error.message}`;
        }
      }

      showErrorInChat(errorMessage);

      // Suggestion de réessayer si trop d'erreurs
      if (errorRetryCount >= MAX_RETRY_COUNT) {
        showErrorInChat(
          "💡 Plusieurs tentatives ont échoué. Veuillez rafraîchir la page ou contacter le support."
        );
      }

    } finally {
      loading = false;
    }
  };

  /**
   * Réinitialise la conversation
   */
  const resetConversation = (): void => {
    messages = [];
    conversationId = null;
    errorRetryCount = 0;
    input = "";
    debugLog('reset', 'Conversation reset');
  };

  /**
   * Toggle du chat
   */
  const toggleChat = (): void => {
    isOpen = !isOpen;
  };

  /**
   * Ferme le chat
   */
  const closeChat = (): void => {
    isOpen = false;
  };

  // ============================================================================
  // GESTION DU CLAVIER
  // ============================================================================

  /**
   * Gestion des raccourcis clavier
   */
  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && isOpen) {
      closeChat();
      event.preventDefault();
    }

    if (event.key === 'Enter' && !event.shiftKey && input.trim()) {
      sendMessage();
      event.preventDefault();
    }
  };
</script>

<svelte:window on:keydown={handleKeydown} />

<style>
  /* ... styles identiques ... */
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

  :global(.chatbot-button.position-right) { right: 24px; }
  :global(.chatbot-button.position-left) { left: 24px; }

  :global(.chatbot-button:hover) {
    transform: scale(1.1);
    box-shadow: 0 12px 32px oklch(66.067% 0.15171 35.164 / 0.315);
  }

  :global(.chatbot-button:active) { transform: scale(0.95); }

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

  .chatbot-popup.position-right { right: 24px; }
  .chatbot-popup.position-left { left: 24px; }

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

  .chatbot-messages::-webkit-scrollbar { width: 6px; }
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

  .message.user { flex-direction: row-reverse; }

  .message-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
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
    white-space: pre-wrap;
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

  .char-counter {
    font-size: 11px;
    color: #6b7280;
    text-align: right;
    margin-top: 4px;
  }

  .char-counter.warning { color: #f59e0b; }
  .char-counter.danger { color: #ef4444; }

  @media (max-width: 480px) {
    .chatbot-popup {
      bottom: 90px;
      width: calc(100vw - 24px);
      height: 500px;
    }
    .chatbot-popup.position-right { right: 12px; }
    .chatbot-popup.position-left { left: 12px; }
    :global(.chatbot-button) { bottom: 16px; }
    :global(.chatbot-button.position-right) { right: 16px; }
    :global(.chatbot-button.position-left) { left: 16px; }
  }
</style>

<!-- Bouton flottant -->
<button
  on:click={toggleChat}
  class="chatbot-button position-{position === 'bottom-right' ? 'right' : 'left'}"
  aria-label="{isOpen ? 'Fermer' : 'Ouvrir'} le chat {currentConfig.name}"
  aria-expanded={isOpen}
>
  {#if hasUnread && !isOpen}
    <span class="chatbot-badge" role="status" aria-label="Nouveaux messages"></span>
  {/if}
  
  <svg 
    style="width: 28px; height: 28px; color: white; transform: {isOpen ? 'rotate(90deg)' : 'rotate(0)'}; transition: transform 0.3s;" 
    fill="none" 
    stroke="currentColor" 
    viewBox="0 0 24 24"
    aria-hidden="true"
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
  <div 
    class="chatbot-popup position-{position === 'bottom-right' ? 'right' : 'left'}"
    role="dialog"
    aria-label="Fenêtre de chat {currentConfig.name}"
    aria-modal="true"
  >
    
    <!-- Header -->
    <div class="chatbot-header">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div 
          style="width: 44px; height: 44px; background: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px;"
          aria-hidden="true"
        >
          {currentConfig.emoji}
        </div>
        <div>
          <h2 style="color: white; font-size: 16px; font-weight: 600; margin: 0;">
            {currentConfig.name}
          </h2>
          <p style="color: rgba(255, 255, 255, 0.8); font-size: 12px; display: flex; align-items: center; gap: 6px; margin-top: 2px;">
            <span 
              style="width: 6px; height: 6px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite;"
              role="status"
              aria-label="En ligne"
            ></span>
            En ligne
          </p>
        </div>
      </div>
      
      <div style="display: flex; gap: 8px;">
        {#if messages.length > 0}
          <button
            on:click={resetConversation}
            style="background: rgba(255, 255, 255, 0.1); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;"
            aria-label="Nouvelle conversation"
            title="Nouvelle conversation"
          >
            <svg style="width: 16px; height: 16px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        {/if}
        
        <button
          on:click={closeChat}
          style="background: rgba(255, 255, 255, 0.1); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;"
          aria-label="Fermer le chat"
        >
          <svg style="width: 18px; height: 18px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Messages -->
    <div class="chatbot-messages" role="log" aria-live="polite" aria-atomic="false">
      {#if messages.length === 0}
        <div style="text-align: center; padding: 40px 20px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div style="font-size: 64px; margin-bottom: 16px;" aria-hidden="true">👋</div>
          <p style="color: #9ca3af; font-size: 15px; line-height: 1.5;">
            Bonjour ! Comment puis-je vous aider aujourd'hui ?
          </p>
          <p style="color: #6b7280; font-size: 13px; margin-top: 8px;">
            {currentConfig.description}
          </p>
        </div>
      {/if}

      {#each messages as message (message.id)}
        <div class="message {message.role}">
          <div class="message-avatar" aria-hidden="true">
            {message.role === "user" ? "👤" : "🤖"}
          </div>
          <div class="message-bubble">
            {message.content}
          </div>
        </div>
      {/each}

      {#if loading}
        <div class="message assistant">
          <div class="message-avatar" aria-hidden="true">🤖</div>
          <div class="typing-dots" aria-label="L'assistant est en train d'écrire">
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
        style="display: flex; flex-direction: column; gap: 8px;"
      >
        <div style="display: flex; gap: 8px; align-items: center;">
          <input
            bind:this={inputRef}
            type="text"
            bind:value={input}
            placeholder="Écrivez votre message..."
            maxlength={maxMessageLength}
            disabled={loading}
            aria-label="Message"
            aria-describedby="char-counter"
            style="flex: 1; padding: 12px 16px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; color: white; font-size: 14px; outline: none;"
          />
          <button
            type="submit"
            disabled={!canSendMessage}
            aria-label="Envoyer le message"
            aria-disabled={!canSendMessage}
            style="
              width: 44px;
              height: 44px;
              background: {loading ? '#4B5563' : 'linear-gradient(135deg, oklch(60.201% 0.11053 58.986) 0%, oklch(65.92% 0.153 34.70) 100%)'};
              border: none;
              border-radius: 12px;
              cursor: {canSendMessage ? 'pointer' : 'not-allowed'};
              display: flex;
              align-items: center;
              justify-content: center;
              opacity: {canSendMessage ? 1 : 0.5};
              transition: all 0.2s;
            "
          >
            <svg style="width: 20px; height: 20px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <p style="font-size: 11px; color: #6b7280; margin: 0;">
            Propulsé par BiscuitsAI
          </p>
          <p 
            id="char-counter"
            class="char-counter {input.length > maxMessageLength * 0.9 ? 'danger' : input.length > maxMessageLength * 0.7 ? 'warning' : ''}"
          >
            {input.length} / {maxMessageLength}
          </p>
        </div>
      </form>
    </div>
  </div>
{/if}