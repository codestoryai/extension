import { JSONContent } from '@tiptap/react';
import { ContextItemWithId, MessageContent, MessagePart, RangeInFile } from '../../..';
import { v4 } from 'uuid';

interface MentionAttrs {
  label: string;
  id: string;
  itemType?: string;
  query?: string;
}

async function resolveEditorContent(
  editorState: JSONContent
): Promise<[ContextItemWithId[], RangeInFile[], MessageContent]> {
  let parts: MessagePart[] = [];
  let contextItemAttrs: MentionAttrs[] = [];
  const selectedCode: RangeInFile[] = [];
  for (const p of editorState.content ?? []) {
    if (p.type === 'paragraph') {
      const [text, ctxItems] = resolveParagraph(p);

      contextItemAttrs.push(...ctxItems);

      if (text === '') {
        continue;
      }

      if (parts[parts.length - 1]?.type === 'text') {
        parts[parts.length - 1].text += '\n' + text;
      } else {
        parts.push({ type: 'text', text });
      }
    } else if (p.type === 'image' && p.attrs) {
      parts.push({
        type: 'imageUrl',
        imageUrl: {
          url: p.attrs.src,
        },
      });
    } else {
      console.warn('Unexpected content type', p.type);
    }
  }

  let contextItemsText = '';
  let contextItems: ContextItemWithId[] = [];

  const fullInput = Array.isArray(parts)
    ? parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n')
    : parts;

  for (const item of contextItemAttrs) {
    const name = item.itemType === 'contextProvider' ? item.id : item.itemType;
    const query = item.query;

    if (!name || !query) {
      continue;
    }

    // Create a promise that will resolve when we get a response
    const messageId = v4();
    const responsePromise = new Promise<any>((resolve) => {
      const handler = (event: MessageEvent) => {
        const response = event.data;
        if (response.type === 'context/getContextItems/response' && response.id === messageId) {
          window.removeEventListener('message', handler);
          resolve(response.items);
        }
      };
      window.addEventListener('message', handler);

      // Send message to extension
      vscode.postMessage({
        type: 'context/getContextItems',
        id: messageId,
        name,
        query,
        fullInput,
        selectedCode,
      });
    });
    const resolvedItems: ContextItemWithId[] = await responsePromise;

    contextItems.push(...resolvedItems);
    for (const resolvedItem of resolvedItems) {
      contextItemsText += resolvedItem.content + '\n\n';
    }
  }

  if (contextItemsText !== '') {
    contextItemsText += '\n';
  }

  return [contextItems, selectedCode, parts];
}

function resolveParagraph(p: JSONContent): [string, MentionAttrs[]] {
  let text = '';
  const contextItems: MentionAttrs[] = [];
  for (const child of p.content || []) {
    if (child.type === 'text') {
      text += text === '' ? (child.text ?? '').trimStart() : (child.text ?? '');
    } else if (child.type === 'mention') {
      text +=
        typeof child.attrs?.renderInlineAs === 'string'
          ? child.attrs?.renderInlineAs
          : child.attrs?.label;

      // Add type guard to ensure child.attrs is a MentionAttrs
      if (
        child.attrs &&
        typeof child.attrs.label === 'string' &&
        typeof child.attrs.id === 'string'
      ) {
        contextItems.push(child.attrs as MentionAttrs);
      }
    } else {
      console.warn('Unexpected child type', child.type);
    }
  }
  return [text, contextItems];
}

export default resolveEditorContent;
