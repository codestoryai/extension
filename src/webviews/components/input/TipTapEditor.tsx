import Document from '@tiptap/extension-document';
import History from '@tiptap/extension-history';
import Image from '@tiptap/extension-image';
import Paragraph from '@tiptap/extension-paragraph';
import Placeholder from '@tiptap/extension-placeholder';
import Text from '@tiptap/extension-text';
import { Plugin } from '@tiptap/pm/state';
import { Editor, EditorContent, JSONContent, useEditor } from '@tiptap/react';
import { useInputHistory } from 'hooks/useInputHistory';
import useUpdatingRef from 'hooks/useUpdatingRef';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSubmenuContext } from 'store/submenuContext';
import { SimpleHTMLElementProps } from 'utils/types';
import { ContextProviderDescription } from '../../../core/context/providers/types';
import InputToolbar from './InputToolbar';
import { Mention } from './MentionExtension';
import { getContextProviderDropdownOptions } from './suggestions';
import { InspectedElementPayload } from '../../../devtools/react/types';

type TipTapEditorProps = SimpleHTMLElementProps<HTMLDivElement> & {
  availableContextProviders: ContextProviderDescription[];
  historyKey: string;
  onEnter: (editorState: JSONContent, editor: Editor) => void;
  onClear: () => void;
  onCancel: () => void;
  onToggleDevtools: () => void;
  showCancelButton: boolean;
  showDevtoolsButton: boolean;
};

function getDataUrlForFile(file: File, img: HTMLImageElement): string {
  const targetWidth = 512;
  const targetHeight = 512;
  const scaleFactor = Math.min(targetWidth / img.width, targetHeight / img.height);

  const canvas = document.createElement('canvas');
  canvas.width = img.width * scaleFactor;
  canvas.height = img.height * scaleFactor;

  const ctx = canvas.getContext('2d');
  ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

  const downsizedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
  return downsizedDataUrl;
}

const Tiptap = (props: TipTapEditorProps) => {
  const {
    availableContextProviders,
    historyKey,
    onEnter,
    onClear,
    onCancel,
    showCancelButton,
    showDevtoolsButton,
    onToggleDevtools,
  } = props;
  const getSubmenuContextItems = useSubmenuContext((state) => state.getSubmenuContextItems);
  const availableContextProvidersRef = useUpdatingRef(availableContextProviders);

  const inSubmenuRef = useRef<string | undefined>(undefined);
  const inDropdownRef = useRef(false);

  const enterSubmenu = async (editor: Editor, providerId: string) => {
    const contents = editor.getText();
    const indexOfAt = contents.lastIndexOf('@');
    if (indexOfAt === -1) {
      return;
    }

    // Find the position of the last @ character
    // We do this because editor.getText() isn't a correct representation including node views
    let startPos = editor.state.selection.anchor;
    while (startPos > 0 && editor.state.doc.textBetween(startPos, startPos + 1) !== '@') {
      startPos--;
    }
    startPos++;

    editor.commands.deleteRange({
      from: startPos,
      to: editor.state.selection.anchor,
    });
    inSubmenuRef.current = providerId;

    // to trigger refresh of suggestions
    editor.commands.insertContent(':');
    editor.commands.deleteRange({
      from: editor.state.selection.anchor - 1,
      to: editor.state.selection.anchor,
    });
  };

  const onClose = () => {
    inSubmenuRef.current = undefined;
    inDropdownRef.current = false;
  };

  const onOpen = () => {
    inDropdownRef.current = true;
  };

  async function handleImageFile(file: File): Promise<[HTMLImageElement, string] | undefined> {
    let filesize = file.size / 1024 / 1024; // filesize in MB
    // check image type and size
    if (
      ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg', 'image/webp'].includes(
        file.type
      ) &&
      filesize < 10
    ) {
      // check dimensions
      let _URL = window.URL || window.webkitURL;
      let img = new window.Image();
      img.src = _URL.createObjectURL(file);

      return await new Promise((resolve) => {
        img.onload = function () {
          const dataUrl = getDataUrlForFile(file, img);

          let image = new window.Image();
          image.src = dataUrl;
          image.onload = function () {
            resolve([image, dataUrl]);
          };
        };
      });
    } else {
      vscode.postMessage({
        type: 'show-toast',
        level: 'error',
        message: 'Images need to be in jpg or png format and less than 10MB in size.',
      });
    }
    return undefined;
  }

  const { prevRef, nextRef, addRef } = useInputHistory(historyKey);

  const editor = useEditor({
    extensions: [
      Document,
      History,
      Image.extend({
        addProseMirrorPlugins() {
          const plugin = new Plugin({
            props: {
              handleDOMEvents: {
                paste(view, event) {
                  const items = event.clipboardData?.items || [];
                  for (const item of items) {
                    const file = item.getAsFile();
                    file &&
                      handleImageFile(file).then((resp) => {
                        if (!resp) return;
                        const [_, dataUrl] = resp;
                        const { schema } = view.state;
                        const node = schema.nodes.image.create({ src: dataUrl });
                        const tr = view.state.tr.insert(0, node);
                        view.dispatch(tr);
                      });
                  }
                },
              },
            },
          });
          return [plugin];
        },
      }),
      Placeholder.configure({
        placeholder: "Ask anything. Use '@' to add context",
      }),
      Paragraph.extend({
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              if (inDropdownRef.current) {
                return false;
              }

              onEnterRef.current();
              return true;
            },
            'Shift-Enter': () =>
              this.editor.commands.first(({ commands }) => [
                () => commands.newlineInCode(),
                () => commands.createParagraphNear(),
                () => commands.liftEmptyBlock(),
                () => commands.splitBlock(),
              ]),
            ArrowUp: () => {
              if (this.editor.state.selection.anchor > 1) {
                return false;
              }

              const previousInput = prevRef.current(this.editor.state.toJSON().doc);
              if (previousInput) {
                this.editor.commands.setContent(previousInput);
                setTimeout(() => {
                  this.editor.commands.blur();
                  this.editor.commands.focus('start');
                }, 0);
                return true;
              }

              return false;
            },
            ArrowDown: () => {
              if (this.editor.state.selection.anchor < this.editor.state.doc.content.size - 1) {
                return false;
              }
              const nextInput = nextRef.current();
              if (nextInput) {
                this.editor.commands.setContent(nextInput);
                setTimeout(() => {
                  this.editor.commands.blur();
                  this.editor.commands.focus('end');
                }, 0);
                return true;
              }

              return false;
            },
            'Ctrl-l': () => {
              onClear();
              return true;
            },
          };
        },
      }).configure({
        HTMLAttributes: {
          class: 'my-1',
        },
      }),
      Text,
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: getContextProviderDropdownOptions(
          availableContextProvidersRef,
          getSubmenuContextItems,
          enterSubmenu,
          onClose,
          onOpen,
          inSubmenuRef
        ),
        renderHTML: (props) => {
          return `@${props.node.attrs.label || props.node.attrs.id}`;
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'outline-none overflow-hidden h-full min-h-[60px]',
        style: `font-size: 14px;`,
      },
    },
    content: '',
  });

  useEffect(() => {
    if (editor && document.hasFocus()) {
      editor.commands.focus('end');
    }
  }, [editor]);

  const [devtoolsData, setDevtoolsData] = useState<{
    inspectedElement: InspectedElementPayload;
    uriType: 'invalid' | 'relative' | 'full';
    name: string;
  } | null>(null);

  useEffect(() => {
    function onInspectedElementChange(event: MessageEvent) {
      const message = event.data;
      if (message.type === 'react-devtools-inspected-element') {
        setDevtoolsData(message);
      }
    }
    window.addEventListener('message', onInspectedElementChange);
    return () => {
      window.removeEventListener('message', onInspectedElementChange);
    };
  }, []);

  useEffect(() => {
    if (editor && devtoolsData) {
      console.log('devtools data', devtoolsData);
      if (devtoolsData.inspectedElement.type === 'full-data') {
        const value = devtoolsData.inspectedElement.value;
        const { doc } = editor.state;
        const { state, dispatch } = editor.view;
        const mentionType = state.schema.nodes.mention;

        const newMentionData = {
          label: devtoolsData.name,
          description:
            devtoolsData.uriType === 'full'
              ? value.source!.sourceURL
              : `Relative path of this file: ${value.source!.sourceURL}`,
          id: value.source!.sourceURL,
          itemType: devtoolsData.uriType === 'full' ? 'file' : 'relative-file',
          query: value.source!.sourceURL,
          providerType: devtoolsData.uriType === 'full' ? 'file' : 'relative-file',
        };

        let lastMentionPos = -1;
        let lastMentionNodeSize = 0;

        // Find the last mention node in the document
        doc.descendants((node, pos) => {
          if (node.type === mentionType) {
            lastMentionPos = pos;
            lastMentionNodeSize = node.nodeSize;
          }
        });

        if (lastMentionPos !== -1) {
          // We found a mention node, so replace it
          const tr = state.tr.replaceWith(
            lastMentionPos,
            lastMentionPos + lastMentionNodeSize,
            mentionType.create(newMentionData)
          );
          dispatch(tr);
        } else {
          // No mention node found, append at the end of the document
          const endPos = doc.content.size;
          const tr = state.tr.insert(endPos, mentionType.create(newMentionData));
          dispatch(tr);
        }
      }
    }
  }, [editor, devtoolsData]);

  const onEnterRef = useUpdatingRef(() => {
    if (!editor) {
      return;
    }

    const json = editor.getJSON();

    // Don't do anything if input box is empty
    if (!json.content?.some((c) => c.content)) {
      return;
    }

    onEnter(json, editor);

    const content = editor.state.toJSON().doc;
    addRef.current(content);
  }, [onEnter, editor]);

  const onClearRef = useUpdatingRef(() => {
    onClear();
  });

  const onCancelRef = useUpdatingRef(() => {
    onCancel();
  });

  const [showDragOverMsg, setShowDragOverMsg] = useState(false);

  useEffect(() => {
    const overListener = () => {
      setShowDragOverMsg(true);
    };
    window.addEventListener('dragover', overListener);

    const leaveListener = () => {
      setTimeout(() => setShowDragOverMsg(false), 2000);
    };
    window.addEventListener('dragleave', leaveListener);

    return () => {
      window.removeEventListener('dragover', overListener);
      window.removeEventListener('dragleave', leaveListener);
    };
  }, []);

  const insertCharacterWithWhitespace = useCallback(
    (char: string) => {
      if (editor) {
        const text = editor.getText();
        if (!text.endsWith(char)) {
          if (text.length > 0 && !text.endsWith(' ')) {
            editor.commands.insertContent(` ${char}`);
          } else {
            editor.commands.insertContent(char);
          }
          editor.commands.focus('end');
        }
      }
    },
    [editor]
  );

  return (
    <div
      className={`ring-offset-background focus-visible:ring-ring flex min-h-[80px] w-full cursor-text flex-col rounded-xs bg-input-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
      onClick={() => {
        editor && editor.commands.focus();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setShowDragOverMsg(true);
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null) {
          setTimeout(() => setShowDragOverMsg(false), 1000);
        }
      }}
      onDragEnter={() => {
        setShowDragOverMsg(true);
      }}
      onDrop={(event) => {
        if (!editor) {
          return;
        }

        setShowDragOverMsg(false);
        let file = event.dataTransfer.files[0];
        handleImageFile(file).then((result) => {
          if (result) {
            const [_, dataUrl] = result;
            const { schema } = editor.state;
            const node = schema.nodes.image.create({ src: dataUrl });
            const tr = editor.state.tr.insert(0, node);
            editor.view.dispatch(tr);
          }
        });
        event.preventDefault();
      }}
    >
      <EditorContent className="h-full w-full flex-1" spellCheck={false} editor={editor} />
      <InputToolbar
        disabled={false}
        onAddContextItem={() => insertCharacterWithWhitespace('@')}
        onImageFileSelected={(file) => {
          if (!editor) {
            return;
          }

          handleImageFile(file).then((result) => {
            if (result) {
              const [_, dataUrl] = result;
              const { schema } = editor.state;
              const node = schema.nodes.image.create({ src: dataUrl });
              editor.commands.command(({ tr }) => {
                tr.insert(0, node);
                return true;
              });
            }
          });
        }}
        onEnter={onEnterRef.current}
        onClear={onClearRef.current}
        onCancel={onCancelRef.current}
        showCancelButton={showCancelButton}
        onToggleDevtools={onToggleDevtools}
        showDevtoolsButton={showDevtoolsButton}
      />

      {showDragOverMsg && (
        <>
          <div className="absolute inset-0 flex h-full w-full items-center justify-center bg-badge-background text-foreground opacity-50" />
          <div className="absolute inset-0 flex h-full w-full items-center justify-center text-foreground">
            Hold ⇧ to drop image
          </div>
        </>
      )}
    </div>
  );
};

export default Tiptap;
