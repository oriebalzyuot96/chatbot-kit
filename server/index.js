import { createChatServer } from './app.js';

const port = Number(process.env.PORT) || 8787;
const server = createChatServer();
server.listen(port, '0.0.0.0', () => {
  console.log(
    `chatbot-kit listening on :${port} (${process.env.ANTHROPIC_API_KEY ? 'model mode' : 'offline fallback mode'})`
  );
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
