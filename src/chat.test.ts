/* eslint-disable @typescript-eslint/no-unsafe-assignment*/

import { expect, test } from 'vitest';
import * as replitai from './index';

test('non streaming chat', async () => {
  const chat = await replitai.chat({
    model: 'chat-bison',
    messages: [{ content: 'what is the meaning of life', author: 'user' }],
    temperature: 0.5,
    maxOutputTokens: 1024,
  });

  expect(chat.error).toBeFalsy();
  expect(chat.value).toMatchObject({
    message: {
      content: expect.any(String),
      author: expect.any(String),
    },
  });
});

test('streaming chat', async () => {
  const chat = await replitai.chatStream({
    model: 'chat-bison',
    messages: [{ content: 'what is the meaning of life', author: 'user' }],
    temperature: 0.5,
    maxOutputTokens: 1024,
  });

  expect(chat.error).toBeFalsy();

  if (!chat.ok) {
    throw new Error('wat');
  }

  for await (const { message } of chat.value) {
    expect(message).toMatchObject({
      content: expect.any(String),
      author: expect.any(String),
    });
  }
});
