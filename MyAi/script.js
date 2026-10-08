const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const API_KEY = "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";
const MODEL = "llama-3.3-70b-versatile";

// Key used to store/retrieve the conversation history in localStorage
const STORAGE_KEY = "zyroChatHistory";

// Key used to store/retrieve the metrics totals in localStorage
const METRICS_STORAGE_KEY = "zyroChatMetrics";

// References to HTML elements we'll need to update
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const sendButton = document.getElementById("sendButton");
const errorBanner = document.getElementById("errorBanner");

// Stores the full conversation history to send on every request
const conversationHistory = [];

// References to the metrics panel elements
const promptTokensEl = document.getElementById("promptTokens");
const completionTokensEl = document.getElementById("completionTokens");
const totalTokensEl = document.getElementById("totalTokens");
const responseTimeEl = document.getElementById("responseTime");

// Running totals across the whole conversation
let promptTokensTotal = 0;
let completionTokensTotal = 0;
let tokensTotal = 0;

function renderMessage(role, content) {
  const messageEl = document.createElement("div");
  messageEl.classList.add("message", role);
  messageEl.textContent = content;
  chatWindow.appendChild(messageEl);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return messageEl;
}

// Saves the current conversation history to localStorage as a JSON string
function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory));
}

// Reads any saved conversation history from localStorage on page load,
// rebuilds the in-memory array, and repaints each message in the chat window
function loadHistory() {
  const savedData = localStorage.getItem(STORAGE_KEY);

  if (!savedData) return;

  try {
    const parsedHistory = JSON.parse(savedData);

    parsedHistory.forEach((message) => {
      conversationHistory.push(message);
      renderMessage(message.role, message.content);
    });
  } catch (error) {
    console.error("Error loading saved conversation:", error);
  }
}

function updateMetrics(usage, elapsedMs) {
  promptTokensTotal += usage.prompt_tokens;
  completionTokensTotal += usage.completion_tokens;
  tokensTotal += usage.total_tokens;

  promptTokensEl.textContent = promptTokensTotal;
  completionTokensEl.textContent = completionTokensTotal;
  totalTokensEl.textContent = tokensTotal;
  responseTimeEl.textContent = `${elapsedMs} ms`;

  saveMetrics(elapsedMs);
}

// Saves the current metrics totals (and last response time) to localStorage
function saveMetrics(lastResponseTime) {
  const metrics = {
    promptTokensTotal,
    completionTokensTotal,
    tokensTotal,
    lastResponseTime
  };
  localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(metrics));
}

// Reads any saved metrics from localStorage on page load and
// restores both the running totals (variables) and the panel display
function loadMetrics() {
  const savedData = localStorage.getItem(METRICS_STORAGE_KEY);

  if (!savedData) return;

  try {
    const parsedMetrics = JSON.parse(savedData);

    promptTokensTotal = parsedMetrics.promptTokensTotal || 0;
    completionTokensTotal = parsedMetrics.completionTokensTotal || 0;
    tokensTotal = parsedMetrics.tokensTotal || 0;

    promptTokensEl.textContent = promptTokensTotal;
    completionTokensEl.textContent = completionTokensTotal;
    totalTokensEl.textContent = tokensTotal;

    if (parsedMetrics.lastResponseTime) {
      responseTimeEl.textContent = `${parsedMetrics.lastResponseTime} ms`;
    }
  } catch (error) {
    console.error("Error loading saved metrics:", error);
  }
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function hideError() {
  errorBanner.hidden = true;
}

async function sendMessage(userText) {
  hideError();

  renderMessage("user", userText);
  conversationHistory.push({ role: "user", content: userText });
  saveHistory();

  const thinkingEl = renderMessage("thinking", "Thinking...");
  sendButton.disabled = true;

  const startTime = performance.now();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: conversationHistory
      })
    });

    const data = await response.json();

    thinkingEl.remove();

    if (!response.ok) {
      throw new Error(data.error?.message || "Unknown API error");
    }

    const assistantText = data.choices[0].message.content;
    renderMessage("assistant", assistantText);

    const elapsedMs = Math.round(performance.now() - startTime);
    updateMetrics(data.usage, elapsedMs);

    conversationHistory.push({ role: "assistant", content: assistantText });
    saveHistory();

  } catch (error) {
    thinkingEl.remove();
    console.error("Error sending message:", error);
    showError(`Something went wrong: ${error.message}. Please try again.`);
    conversationHistory.pop();
    saveHistory();
  } finally {
    sendButton.disabled = false;
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = userInput.value.trim();
  if (!text) return;

  sendMessage(text);
  userInput.value = "";
});

// Load any previously saved conversation and metrics as soon as the page opens
loadHistory();
loadMetrics();
