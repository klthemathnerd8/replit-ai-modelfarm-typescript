import { Elysia, t, ws } from 'elysia';
import { html } from '@elysiajs/html'
import { staticPlugin } from '@elysiajs/static'
import sanitizeHtml from 'sanitize-html';
import { marked } from "marked";
import * as ai from '@replit/ai-modelfarm'


interface ChatBody {
  conversation: string;
  message: string;
}

const context = "You are a kind, happy, and smart assistant. Being wrong is against your nature.";
const maxTokens = 2048;
const model = "chat-bison";
const permittedTags = sanitizeHtml.defaults.allowedTags.concat(['a', 'br']);
const temperature = 0.2;

const conversationItem = (history: string, id?: string): string => `
  <input 
    type="hidden"
    name="conversation"
    id="${id ?? 'conversation'}"
    value="${history}"
    hidden
    hx-swap-oob="true">
  `;

const messageSection = (...contents: string[]): string => `
  <section id="messages" hx-swap-oob="beforeend">
    ${contents.join('')}
  </section
`

const messageItem = (
  author: string,
  message: string,
  backgroundClasses?: string,
  id?: string,
  attrs?: string): string => {
  // tidy the message as appropriate
  message = message.replace(/\\n/g, '<br>')
  let parsedResult = marked.parse(message)
  const sanitized = sanitizeHtml(parsedResult, {
    allowedTags: permittedTags
  })
  return `
    <article
      class="p-2 flex gap-1 ${backgroundClasses ?? ''}"
      id="${id ?? ''}" 
      ${attrs ?? ''}>
      <header class="font-bold min-w-[3em]">${author}:</header>
      <section>${sanitized}</section>
    </article>`
}

const app = new Elysia()
  .use(html())
  .use(staticPlugin())
  .use(ws())
  .get("/", () => Bun.file("src/pages/index.html").text())
  .ws("/chatbot", {
    async message(ws, input) {
      const { conversation, message } = input as ChatBody;

      let parsedConversation: ai.ChatMessage[] = [];
      if (conversation && conversation != "") {
        try {
          parsedConversation = JSON.parse(conversation);
        } catch (e) {
          console.error(e);
        }
      }

      // Add the new user message to the conversation
      parsedConversation.push({
        "author": "User:",
        "content": message
      });

      // configure the 🤖 request
      const req: ai.ChatOptions = {
        context,
        maxOutputTokens: maxTokens,
        messages: parsedConversation,
        model,
        temperature,
      }

      let result;
      try {
        result = await ai.chatStream(req);
      } catch (e) {
        result = { error: e }
      }

      if (result.error) {
        // Log the error, and return a red error result
        console.error("Error from server: ", result.error)
        errMsg = messageItem("Error", "Encountered an issue with your request, please try again.", "bg-red-100")
        ws.send(`
          ${messageSection(errMsg)}
          ${conversationItem(conversation)}
        `)
        return
      }
      if (!result.value) {
        // Nothing came back, unexpected.
        log.error("Unexpected result:", result);
        return
      }

      const generator = result.value;

      // Create an ID we can use to replace the message as it is built out over the websocket
      const aiMessageId = `m-id-${Date.now()}`;
      // Send the basic structure. One element should have the ai message ID to be replaced.
      ws.send(
        messageSection(
          messageItem("You", message),
          messageItem("AI", "", "bg-blue-100", aiMessageId)
        )
      );

      // Build out the message, sending it over the socket as it's assembled, replacing the ai element with each step.
      let aiResult = "";
      for await (const chunk of generator) {
        aiResult += chunk.message.content;
        ws.send(messageItem("AI", aiResult, "bg-blue-100", aiMessageId, "hx-swap-oob='true'"))
      }

      // Push the new message into the conversation for the next request to use
      parsedConversation.push({
        "author": "AI:",
        "content": aiResult
      });
      const history = JSON.stringify(parsedConversation).replace(/"/g, '&quot;');
      ws.send(conversationItem(history))
      return
    },
  }).listen(3000);

console.log("Ready to chat!");
