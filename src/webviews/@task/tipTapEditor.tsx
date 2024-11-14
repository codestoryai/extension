import * as vscode from 'vscode';

import { AtSymbolIcon, PhotoIcon } from "@heroicons/react/24/outline";
import Document from "@tiptap/extension-document";
import History from "@tiptap/extension-history";
import Image from "@tiptap/extension-image";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { Plugin } from "@tiptap/pm/state";
import { mergeAttributes, Node } from "@tiptap/core";
import { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { SuggestionOptions } from "@tiptap/suggestion";
import { Editor, EditorContent, JSONContent, useEditor } from "@tiptap/react";
import {
  KeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { debounce } from "lodash";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { v4 } from "uuid";
import "./TipTapEditor.css";


export const VSC_BADGE_BACKGROUND_VAR = "--vscode-badge-background";
export const VSC_FOREGROUND_VAR = "--vscode-editor-foreground";
export const defaultBorderRadius = "5px";
export const lightGray = "#999998";
export const vscBadgeBackground = `var(${VSC_BADGE_BACKGROUND_VAR}, #1bbe84)`;
export const vscForeground = `var(${VSC_FOREGROUND_VAR}, #fff)`;
export const VSC_INPUT_BACKGROUND_VAR = "--vscode-input-background";
export const vscInputBackground = `var(${VSC_INPUT_BACKGROUND_VAR}, rgb(45 45 45))`;
export const VSC_INPUT_BORDER_VAR = "--vscode-input-border";
export const vscInputBorder = `var(${VSC_INPUT_BORDER_VAR}, ${lightGray})`;
export const VSC_INPUT_BORDER_FOCUS_VAR = "--vscode-focusBorder";
export const vscInputBorderFocus = `var(${VSC_INPUT_BORDER_FOCUS_VAR}, ${lightGray})`;


const StyledDiv = styled.div<{ isHidden: boolean }>`
  padding: 4px 0;
  justify-content: space-between;
  gap: 1px;
  background-color: ${vscInputBackground};
  align-items: center;
  font-size: ${getFontSize() - 2}px;
  cursor: ${(props) => (props.isHidden ? "default" : "text")};
  opacity: ${(props) => (props.isHidden ? 0 : 1)};
  pointer-events: ${(props) => (props.isHidden ? "none" : "auto")};
  user-select: none;

  & > * {
    flex: 0 0 auto;
  }
`;

const HoverItem = styled.span<{ isActive?: boolean }>`
  padding: 0 4px;
  padding-top: 2px;
  padding-bottom: 2px;
  cursor: pointer;
  transition:
    color 200ms,
    background-color 200ms,
    box-shadow 200ms;
`;

const EnterButton = styled.button`
  all: unset;
  padding: 2px 4px;
  display: flex;
  align-items: center;
  background-color: ${lightGray}33;
  border-radius: ${defaultBorderRadius};
  color: ${vscForeground};
  cursor: pointer;
  :disabled {
    cursor: wait;
  }
`;

export interface ToolbarOptions {
  hideUseCodebase?: boolean;
  hideImageUpload?: boolean;
  hideAddContext?: boolean;
  enterText?: string;
  hideSelectModel?: boolean;
}

interface InputToolbarProps {
  onEnter?: (modifiers: InputModifiers) => void;
  onAddContextItem?: () => void;
  onAddSlashCommand?: () => void;
  onClick?: () => void;
  onImageFileSelected?: (file: File) => void;
  hidden?: boolean;
  activeKey: string | null;
  toolbarOptions?: ToolbarOptions;
  disabled?: boolean;
}

import ReactDOM from "react-dom";

const TooltipStyles = {
  fontSize: `${getFontSize() - 2}px`,
  backgroundColor: vscInputBackground,
  boxShadow: `0px 0px 2px 1px ${vscBadgeBackground}`,
  color: vscForeground,
  padding: "4px 8px",
  zIndex: 1000,
  maxWidth: "80vw",
  textAlign: "center",
  overflow: "hidden",
};

export function ToolTip(props: any) {
  const combinedStyles = {
    ...TooltipStyles,
    ...props.style,
  };

  const tooltipPortalDiv = document.getElementById("tooltip-portal-div");

  return (
    tooltipPortalDiv &&
    ReactDOM.createPortal(
      <Tooltip {...props} style={combinedStyles} />,
      tooltipPortalDiv,
    )
  );
}

function InputToolbar(props: InputToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const defaultModel = useSelector(defaultModelSelector);
  const useActiveFile = useSelector(selectUseActiveFile);

  const supportsImages = true;

  return (
    <>
      <StyledDiv
        // @ts-ignore
        isHidden={props.hidden}
        onClick={props.onClick}
        id="input-toolbar"
        className="flex find-widget-skip"
      >
        <div className="flex items-center justify-start gap-2 whitespace-nowrap">
          <div className="xs:flex -mb-1 hidden items-center gap-1 text-gray-400 transition-colors duration-200">
            {props.toolbarOptions?.hideImageUpload ||
              (supportsImages && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    accept=".jpg,.jpeg,.png,.gif,.svg,.webp"
                    onChange={(e) => {
                      for (const file of e.target.files) {
                        props.onImageFileSelected(file);
                      }
                    }}
                  />
                  <HoverItem>
                    <PhotoIcon
                      className="h-4 w-4"
                      onClick={(e) => {
                        fileInputRef.current?.click();
                      }}
                    />
                  </HoverItem>
                </>
              ))}
            {props.toolbarOptions?.hideAddContext || (
              <HoverItem onClick={props.onAddContextItem}>
                <AtSymbolIcon
                  data-tooltip-id="add-context-item-tooltip"
                  className="h-4 w-4"
                />

                <ToolTip id="add-context-item-tooltip" place="top-start">
                  Add context (files, docs, urls, etc.)
                </ToolTip>
              </HoverItem>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 whitespace-nowrap text-gray-400">
          {props.toolbarOptions?.hideUseCodebase || (
            <div className="hidden transition-colors duration-200 hover:underline sm:flex">
              {props.activeKey === "Alt" ? (
                <HoverItem className="underline">
                  {`${getAltKeyLabel()}⏎ 
                  ${useActiveFile ? "No active file" : "Active file"}`}
                </HoverItem>
              ) : (
                <HoverItem
                  className={props.activeKey === "Meta" && "underline"}
                  onClick={(e) =>
                    props.onEnter({
                      useCodebase: true,
                      noContext: !useActiveFile,
                    })
                  }
                >
                  <span data-tooltip-id="add-codebase-context-tooltip">
                    {getMetaKeyLabel()}⏎ @codebase
                  </span>
                  <ToolTip id="add-codebase-context-tooltip" place="top-end">
                    Submit with the codebase as context ({getMetaKeyLabel()}⏎)
                  </ToolTip>
                </HoverItem>
              )}
            </div>
          )}

          <EnterButton
            onClick={(e) => {
              props.onEnter({
                useCodebase: isMetaEquivalentKeyPressed(e as any),
                noContext: useActiveFile ? e.altKey : !e.altKey,
              });
            }}
            disabled={props.disabled}
          >
            <span className="hidden md:inline">
              ⏎ {props.toolbarOptions?.enterText ?? "Enter"}
            </span>
            <span className="md:hidden">⏎</span>
          </EnterButton>
        </div>
      </StyledDiv>
    </>
  );
}

export type MentionOptions = {
  HTMLAttributes: Record<string, any>;
  renderHTML: (props: {
    options: MentionOptions;
    node: ProseMirrorNode;
  }) => DOMOutputSpec;
  suggestion: Omit<SuggestionOptions, "editor">;
};

export const MentionPluginKey = new PluginKey("mention");

export const Mention = Node.create<MentionOptions>({
  name: "mention",

  addOptions() {
    return {
      HTMLAttributes: {},
      renderHTML({ options, node }) {
        return [
          "span",
          this.HTMLAttributes,
          `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`,
        ];
      },
      suggestion: {
        char: "@",
        pluginKey: MentionPluginKey,
        command: ({ editor, range, props }) => {
          // increase range.to by one when the next node is of type "text"
          // and starts with a space character
          const nodeAfter = editor.view.state.selection.$to.nodeAfter;
          const overrideSpace = nodeAfter?.text?.startsWith(" ");

          if (overrideSpace) {
            range.to += 1;
          }

          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: this.name,
                attrs: props,
              },
              {
                type: "text",
                text: " ",
              },
            ])
            .run();

          window.getSelection()?.collapseToEnd();
        },
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          const type = state.schema.nodes[this.name];
          const allow = !!$from.parent.type.contentMatch.matchType(type);

          // Check if there's a space after the "@"
          const textFrom = range.from;
          const textTo = state.selection.$to.pos;
          const text = state.doc.textBetween(textFrom, textTo);
          const hasSpace = text.includes(" ");

          return allow && !hasSpace;
        },
      },
    };
  },

  group: "inline",

  inline: true,

  selectable: false,

  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-id"),
        renderHTML: (attributes) => {
          if (!attributes.id) {
            return {};
          }

          return {
            "data-id": attributes.id,
          };
        },
      },

      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attributes) => {
          if (!attributes.label) {
            return {};
          }

          return {
            "data-label": attributes.label,
          };
        },
      },

      renderInlineAs: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-renderInlineAs"),
        renderHTML: (attributes) => {
          if (!attributes.renderInlineAs) {
            return {};
          }

          return {
            "data-renderInlineAs": attributes.renderInlineAs,
          };
        },
      },

      query: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-query"),
        renderHTML: (attributes) => {
          if (!attributes.query) {
            return {};
          }

          return {
            "data-query": attributes.query,
          };
        },
      },

      itemType: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-itemType"),
        renderHTML: (attributes) => {
          if (!attributes.itemType) {
            return {};
          }

          return {
            "data-itemType": attributes.itemType,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `span[data-type="${this.name}"]`,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const html = this.options.renderHTML({
      options: this.options,
      node,
    });

    if (typeof html === "string") {
      return [
        "span",
        mergeAttributes(
          { "data-type": this.name },
          this.options.HTMLAttributes,
          HTMLAttributes,
        ),
        html,
      ];
    }
    return html;
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          let isMention = false;
          const { selection } = state;
          const { empty, anchor } = selection;

          if (!empty) {
            return false;
          }

          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              isMention = true;
              tr.insertText(
                this.options.suggestion.char || "",
                pos,
                pos + node.nodeSize,
              );

              return false;
            }
          });

          return isMention;
        }),
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

type Platform = "mac" | "linux" | "windows" | "unknown";

export function getPlatform(): Platform {
    const platform = window.navigator.platform.toUpperCase();
    if (platform.indexOf("MAC") >= 0) {
      return "mac";
    } else if (platform.indexOf("LINUX") >= 0) {
      return "linux";
    } else if (platform.indexOf("WIN") >= 0) {
      return "windows";
    } else {
      return "unknown";
    }
}  

export function isMetaEquivalentKeyPressed({
    metaKey,
    ctrlKey,
  }: KeyboardEvent): boolean {
    const platform = getPlatform();
    switch (platform) {
      case "mac":
        return metaKey;
      case "linux":
      case "windows":
        return ctrlKey;
      default:
        return metaKey;
    }
  }  

function getFontSize(): number {
    return 14;
}  

export interface ContextItemId {
    providerTitle: string;
    itemId: string;
}

export type ContextItemUriTypes = "file" | "url";

export interface ContextItemUri {
  type: ContextItemUriTypes;
  value: string;
}

export interface ContextItem {
    content: string;
    name: string;
    description: string;
    editing?: boolean;
    editable?: boolean;
    icon?: string;
    uri?: ContextItemUri;
}
  
export interface ContextItemWithId extends ContextItem {
    id: ContextItemId;
}  


function getWorkspaceDirectories(): string[] {
    return vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
}

const SEP_REGEX = /[\\/]/;

export function splitPath(path: string, withRoot?: string): string[] {
    let parts = path.includes("/") ? path.split("/") : path.split("\\");
    if (withRoot !== undefined) {
      const rootParts = splitPath(withRoot);
      parts = parts.slice(rootParts.length - 1);
    }
    return parts;
}  

export function getRelativePath(
    filepath: string,
    workspaceDirs: string[],
  ): string {
    for (const workspaceDir of workspaceDirs) {
      const filepathParts = splitPath(filepath);
      const workspaceDirParts = splitPath(workspaceDir);
      if (
        filepathParts.slice(0, workspaceDirParts.length).join("/") ===
        workspaceDirParts.join("/")
      ) {
        return filepathParts.slice(workspaceDirParts.length).join("/");
      }
    }
    return splitPath(filepath).pop() ?? ""; // If the file is not in any of the workspaces, return the plain filename
}  

export function getBasename(filepath: string): string {
  return filepath.split(SEP_REGEX).pop() ?? "";
}

export interface RangeInFile {
    filepath: string;
    range: Range;
}
  
export interface Location {
    filepath: string;
    position: Position;
}
  
export interface FileWithContents {
    filepath: string;
    contents: string;
}
  
export interface Range {
    start: Position;
    end: Position;
}
export interface Position {
    line: number;
    character: number;
}  

export function isWebEnvironment(): boolean {
    return (
      typeof window !== "undefined" &&
      window.navigator &&
      window.navigator.userAgent.indexOf("Electron") === -1
    );
}

const isWebEnv = isWebEnvironment();

export const handleCutOperation = async (text: string, editor: Editor) => {
    if (isWebEnv) {
      await navigator.clipboard.writeText(text);
      editor.commands.deleteSelection();
    } else {
      document.execCommand("cut");
    }
  };
  
  export const handleCopyOperation = async (text: string) => {
    if (isWebEnv) {
      await navigator.clipboard.writeText(text);
    } else {
      document.execCommand("copy");
    }
  };
  
  export const handlePasteOperation = async (editor: Editor) => {
    if (isWebEnv) {
      const clipboardText = await navigator.clipboard.readText();
      editor.commands.insertContent(clipboardText);
    } else {
      document.execCommand("paste");
    }
  };  

export const handleMetaKeyPress = async (e: KeyboardEvent, editor: Editor) => {
    const text = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
    );
  
    const handlers: Record<string, () => Promise<void>> = {
      x: () => handleCutOperation(text, editor),
      c: () => handleCopyOperation(text),
      v: () => handlePasteOperation(editor),
    };
  
    if (e.key in handlers) {
      e.stopPropagation();
      e.preventDefault();
      await handlers[e.key]();
    }
};  


const InputBoxDiv = styled.div<{ border?: string }>`
  resize: none;
  padding-bottom: 4px;
  font-family: inherit;
  border-radius: ${defaultBorderRadius};
  margin: 0;
  height: auto;
  width: 100%;
  background-color: ${vscInputBackground};
  color: ${vscForeground};
  border: ${(props: any) =>
    props.border ? props.border : `0.5px solid ${vscInputBorder}`};
  outline: none;
  font-size: ${getFontSize()}px;

  &:focus {
    outline: none;

    border: 0.5px solid ${vscInputBorderFocus};
  }

  &::placeholder {
    color: ${lightGray}cc;
  }

  display: flex;
  flex-direction: column;
`;

const PaddingDiv = styled.div`
  padding: 8px 12px;
  padding-bottom: 4px;
`;

const HoverDiv = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  opacity: 0.5;
  background-color: ${vscBadgeBackground};
  color: ${vscForeground};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const HoverTextDiv = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  color: ${vscForeground};
  display: flex;
  align-items: center;
  justify-content: center;
`;

function getDataUrlForFile(file: File, img: any): string {
  const targetWidth = 512;
  const targetHeight = 512;
  const scaleFactor = Math.min(
    targetWidth / img.width,
    targetHeight / img.height,
  );

  const canvas = document.createElement("canvas");
  canvas.width = img.width * scaleFactor;
  canvas.height = img.height * scaleFactor;

  const ctx = canvas.getContext("2d");
  // @ts-ignore figure out what to do over here
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const downsizedDataUrl = canvas.toDataURL("image/jpeg", 0.7);
  return downsizedDataUrl;
}

type ContextProviderName =
  | "diff"
  | "github"
  | "terminal"
  | "debugger"
  | "open"
  | "google"
  | "search"
  | "tree"
  | "http"
  | "codebase"
  | "problems"
  | "folder"
  | "jira"
  | "postgres"
  | "database"
  | "code"
  | "docs"
  | "gitlab-mr"
  | "os"
  | "currentFile"
  | "greptile"
  | "outline"
  | "continue-proxy"
  | "highlights"
  | "file"
  | "issue"
  | "repo-map"
  | "url"
  | string;

export type ContextProviderType = "normal" | "query" | "submenu";

export interface ContextProviderDescription {
    title: ContextProviderName;
    displayTitle: string;
    description: string;
    renderInlineAs?: string;
    type: ContextProviderType;
    dependsOnIndexing?: boolean;
}

export interface InputModifiers {
    useCodebase: boolean;
    noContext: boolean;
}  

interface TipTapEditorProps {
  availableContextProviders: ContextProviderDescription[];
  isMainInput: boolean;
  onEnter: (
    editorState: JSONContent,
    modifiers: InputModifiers,
    editor: Editor,
  ) => void;
  editorState?: JSONContent;
  toolbarOptions?: ToolbarOptions;
  border?: string;
  placeholder?: string;
  header?: React.ReactNode;
  historyKey: string;
}

function TipTapEditor(props: TipTapEditorProps) {
  const dispatch = useDispatch();

  const { getSubmenuContextItems } = useContext(SubmenuContextProvidersContext);

  const historyLength = useSelector(
    (store: RootState) => store.state.history.length,
  );
  const useActiveFile = useSelector(selectUseActiveFile);

  const { saveSession, loadSession } = useHistory(dispatch);

  const [isEditorFocused, setIsEditorFocused] = useState(false);
  // const [hasDefaultModel, setHasDefaultModel] = useState(true);

  const inSubmenuRef = useRef<string | undefined>(undefined);
  const inDropdownRef = useRef(false);

  const enterSubmenu = async (editor: Editor, providerId: string) => {
    const contents = editor.getText();
    const indexOfAt = contents.lastIndexOf("@");
    if (indexOfAt === -1) {
      return;
    }

    // Find the position of the last @ character
    // We do this because editor.getText() isn't a correct representation including node views
    let startPos = editor.state.selection.anchor;
    while (
      startPos > 0 &&
      editor.state.doc.textBetween(startPos, startPos + 1) !== "@"
    ) {
      startPos--;
    }
    startPos++;

    editor.commands.deleteRange({
      from: startPos,
      to: editor.state.selection.anchor,
    });
    inSubmenuRef.current = providerId;

    // to trigger refresh of suggestions
    editor.commands.insertContent(":");
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

  const contextItems = useSelector(
    (store: RootState) => store.state.contextItems,
  );

  const defaultModel = useSelector(defaultModelSelector);
  const defaultModelRef = useUpdatingRef(defaultModel);

  const getSubmenuContextItemsRef = useUpdatingRef(getSubmenuContextItems);
  const availableContextProvidersRef = useUpdatingRef(
    props.availableContextProviders,
  );

  const historyLengthRef = useUpdatingRef(historyLength);

  const active = useSelector((state: RootState) => state.state.active);
  const activeRef = useUpdatingRef(active);

  // Only set `hasDefaultModel` after a timeout to prevent jank
  useEffect(() => {
    const timer = setTimeout(() => {
    //   setHasDefaultModel(
    //     !!defaultModel &&
    //       defaultModel.apiKey !== undefined &&
    //       defaultModel.apiKey !== "",
    //   );
    }, 3500);

    // Cleanup function to clear the timeout if the component unmounts
    return () => clearTimeout(timer);
  }, [defaultModel]);

  async function handleImageFile(
    file: File,
  ): Promise<[HTMLImageElement, string] | undefined> {
    let filesize = file.size / 1024 / 1024; // filesize in MB
    // check image type and size
    if (
      [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/svg",
        "image/webp",
      ].includes(file.type) &&
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
    }
    return undefined;
  }

  // const { prevRef, nextRef, addRef } = useInputHistory(props.historyKey);


  // @ts-ignore
  const editor: Editor = useEditor({
    extensions: [
      Document,
      History,
      Image.extend({
        addProseMirrorPlugins() {
          const plugin = new Plugin({
            props: {
              handleDOMEvents: {
                paste(view, event) {
                  const model = defaultModelRef.current;
                  // @ts-ignore
                  const items = event.clipboardData.items;
                  for (const item of items) {
                    const file = item.getAsFile();
                    // file &&
                    //   modelSupportsImages(
                    //     model.provider,
                    //     model.model,
                    //     model.title,
                    //     model.capabilities,
                    //   ) &&
                    file &&
                    true &&
                      handleImageFile(file).then((resp) => {
                        if (!resp) return;
                        const [img, dataUrl] = resp;
                        const { schema } = view.state;
                        const node = schema.nodes.image.create({
                          src: dataUrl,
                        });
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
        placeholder:
          props.placeholder ??
          (historyLengthRef.current === 0
            ? "Ask anything, '/' for slash commands, '@' to add context"
            : "Ask a follow-up"),
      }),
      Paragraph.extend({
        // @ts-ignore
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              if (inDropdownRef.current) {
                return false;
              }

              onEnterRef.current({
                useCodebase: false,
                noContext: !useActiveFile,
              });
              return true;
            },

            "Mod-Enter": () => {
              onEnterRef.current({
                useCodebase: true,
                noContext: !useActiveFile,
              });
              return true;
            },
            "Alt-Enter": () => {
              onEnterRef.current({
                useCodebase: false,
                noContext: useActiveFile,
              });

              return true;
            },
            "Mod-Backspace": () => {
              // If you press cmd+backspace wanting to cancel,
              // but are inside of a text box, it shouldn't
              // delete the text
              if (activeRef.current) {
                return true;
              }
            },
            "Shift-Enter": () =>
              this.editor.commands.first(({ commands }) => [
                () => commands.newlineInCode(),
                () => commands.createParagraphNear(),
                () => commands.liftEmptyBlock(),
                () => commands.splitBlock(),
              ]),

            ArrowUp: () => {
              return false;
              // if (this.editor.state.selection.anchor > 1) {
              //   return false;
              // }

              // const previousInput = prevRef.current(
              //   this.editor.state.toJSON().doc,
              // );
              // if (previousInput) {
              //   this.editor.commands.setContent(previousInput);
              //   setTimeout(() => {
              //     this.editor.commands.blur();
              //     this.editor.commands.focus("start");
              //   }, 0);
              //   return true;
              // }
            },
            ArrowDown: () => {
              return false;
            },
          };
        },
      }).configure({
        HTMLAttributes: {
          class: "my-1",
        },
      }),
      Text,
      props.availableContextProviders.length
        ? Mention.configure({
            HTMLAttributes: {
              class: "mention",
            },
            suggestion: getContextProviderDropdownOptions(
              availableContextProvidersRef,
              getSubmenuContextItemsRef,
              enterSubmenu,
              onClose,
              onOpen,
              inSubmenuRef,
            ),
            renderHTML: (props: any) => {
              return `@${props.node.attrs.label || props.node.attrs.id}`;
            },
          })
        : undefined,
    //   props.availableSlashCommands.length
    //     ? SlashCommand.configure({
    //         HTMLAttributes: {
    //           class: "mention",
    //         },
    //         suggestion: getSlashCommandDropdownOptions(
    //           availableSlashCommandsRef,
    //           onClose,
    //           onOpen,
    //           ideMessenger,
    //         ),
    //         renderText: (props: any) => {
    //           return props.node.attrs.label;
    //         },
    //       })
    //     : undefined,
      undefined,
    ],
    editorProps: {
      attributes: {
        class: "outline-none -mt-1 overflow-hidden",
        style: `font-size: ${getFontSize()}px;`,
      },
    },
    content: "",
    onFocus: () => setIsEditorFocused(true),
    onBlur: () => setIsEditorFocused(false),
    onUpdate: ({ editor, transaction }) => {
      // If /edit is typed and no context items are selected, select the first

      if (contextItems.length > 0) {
        return;
      }

      const json = editor.getJSON();
      let codeBlock = json.content?.find((el) => el.type === "codeBlock");
      if (!codeBlock) {
        return;
      }
    },
    editable: !active || props.isMainInput,
  });

  const [shouldHideToolbar, setShouldHideToolbar] = useState(false);
  const debouncedShouldHideToolbar = debounce((value) => {
    setShouldHideToolbar(value);
  }, 200);

  useEffect(() => {
    if (editor) {
      const handleFocus = () => {
        debouncedShouldHideToolbar(false);
      };

      const handleBlur = () => {
        debouncedShouldHideToolbar(true);
      };

      editor.on("focus", handleFocus);
      editor.on("blur", handleBlur);

      return () => {
        editor.off("focus", handleFocus);
        editor.off("blur", handleBlur);
      };
    }
  }, [editor]);

  const editorFocusedRef = useUpdatingRef(editor?.isFocused, [editor]);

  /**
   * This handles various issues with meta key actions
   * - In JetBrains, when using OSR in JCEF, there is a bug where using the meta key to
   *   highlight code using arrow keys is not working
   * - In VS Code, while working with .ipynb files there is a problem where copy/paste/cut will affect
   *   the actual notebook cells, even when performing them in our GUI
   *
   *  Currently keydown events for a number of keys are not registering if the
   *  meta/shift key is pressed, for example "x", "c", "v", "z", etc.
   *  Until this is resolved we can't turn on OSR for non-Mac users due to issues
   *  with those key actions.
   */
  const handleKeyDown = async (e: KeyboardEvent<HTMLDivElement>) => {
    if (!editorFocusedRef?.current) return;

    setActiveKey(e.key);

    // Handle meta key issues
    if (isMetaEquivalentKeyPressed(e)) {
      await handleMetaKeyPress(e, editor);
    }
  };

  const handleKeyUp = () => {
    setActiveKey(null);
  };

  const onEnterRef = useUpdatingRef(
    (modifiers: InputModifiers) => {
      if (active) {
        return;
      }

      const json = editor.getJSON();

      // Don't do anything if input box is empty
      if (!json.content?.some((c) => c.content)) {
        return;
      }

      props.onEnter(json, modifiers, editor);

      if (props.isMainInput) {
        const content = editor.state.toJSON().doc;
        addRef.current(content);
      }
    },
    [props.onEnter, editor, props.isMainInput],
  );

  // Re-focus main input after done generating
  useEffect(() => {
    if (editor && !active && props.isMainInput && document.hasFocus()) {
      editor.commands.focus(undefined, { scrollIntoView: false });
    }
  }, [props.isMainInput, active, editor]);

  // IDE event listeners
  useWebviewListener(
    "userInput",
    async (data: any) => {
      if (!props.isMainInput) {
        return;
      }
      editor?.commands.insertContent(data.input);
      onEnterRef.current({ useCodebase: false, noContext: true });
    },
    [editor, onEnterRef.current, props.isMainInput],
  );

  useWebviewListener("jetbrains/editorInsetRefresh", async () => {
    editor?.chain().clearContent().focus().run();
  });

  useWebviewListener(
    "focusContinueInput",
    async (data: any) => {
      if (!props.isMainInput) {
        return;
      }
      if (historyLength > 0) {
        await saveSession();
      }
      setTimeout(() => {
        editor?.commands.blur();
        editor?.commands.focus("end");
      }, 20);
    },
    [historyLength, saveSession, editor, props.isMainInput],
  );

  useWebviewListener(
    "focusContinueInputWithoutClear",
    async () => {
      if (!props.isMainInput) {
        return;
      }
      setTimeout(() => {
        editor?.commands.focus("end");
      }, 20);
    },
    [editor, props.isMainInput],
  );

  useWebviewListener(
    "focusContinueInputWithNewSession",
    async () => {
      if (!props.isMainInput) {
        return;
      }
      await saveSession();
      setTimeout(() => {
        editor?.commands.focus("end");
      }, 20);
    },
    [editor, props.isMainInput, saveSession],
  );

  useWebviewListener(
    "highlightedCode",
    // @ts-ignore
    async (data) => {
      if (!props.isMainInput || !editor) {
        return;
      }

      const rif: RangeInFile & { contents: string } =
        data.rangeInFileWithContents;
      const basename = getBasename(rif.filepath);
      const relativePath = getRelativePath(
        rif.filepath,
        getWorkspaceDirectories(),
      );
      const rangeStr = `(${rif.range.start.line + 1}-${
        rif.range.end.line + 1
      })`;

      const itemName = `${basename} ${rangeStr}`;
      const item: ContextItemWithId = {
        content: rif.contents,
        name: itemName,
        // Description is passed on to the LLM to give more context on file path
        description: `${relativePath} ${rangeStr}`,
        id: {
          providerTitle: "code",
          itemId: v4(),
        },
        uri: {
          type: "file",
          value: rif.filepath,
        },
      };

      let index = 0;
      // @ts-ignore
      for (const el of editor.getJSON().content) {
        if (el.attrs?.item?.name === itemName) {
          return; // Prevent duplicate code blocks
        }
        if (el.type === "codeBlock") {
          index += 2;
        } else {
          break;
        }
      }
      editor
        .chain()
        .insertContentAt(index, {
          type: "codeBlock",
          attrs: {
            item,
          },
        })
        .run();

      if (data.prompt) {
        editor.commands.focus("end");
        editor.commands.insertContent(data.prompt);
      }

      if (data.shouldRun) {
        onEnterRef.current({ useCodebase: false, noContext: true });
      }

      setTimeout(() => {
        editor.commands.blur();
        editor.commands.focus("end");
      }, 20);
    },
    [
      editor,
      props.isMainInput,
      historyLength,
      props.isMainInput,
      onEnterRef.current,
    ],
  );

  useWebviewListener(
    "isContinueInputFocused",
    async () => {
      return props.isMainInput && editorFocusedRef.current;
    },
    [editorFocusedRef, props.isMainInput],
    !props.isMainInput,
  );

  useWebviewListener(
    "focusContinueSessionId",
    async (data: any) => {
      if (!props.isMainInput) {
        return;
      }
      loadSession(data.sessionId);
    },
    [loadSession, props.isMainInput],
  );

  const [showDragOverMsg, setShowDragOverMsg] = useState(false);

  useEffect(() => {
    const overListener = (event: DragEvent) => {
      if (event.shiftKey) return;
      setShowDragOverMsg(true);
    };
    window.addEventListener("dragover", overListener);

    const leaveListener = (event: DragEvent) => {
      if (event.shiftKey) {
        setShowDragOverMsg(false);
      } else {
        setTimeout(() => setShowDragOverMsg(false), 2000);
      }
    };
    window.addEventListener("dragleave", leaveListener);

    return () => {
      window.removeEventListener("dragover", overListener);
      window.removeEventListener("dragleave", leaveListener);
    };
  }, []);

  const [activeKey, setActiveKey] = useState<string | null>(null);

  const insertCharacterWithWhitespace = useCallback(
    (char: string) => {
      const text = editor.getText();
      if (!text.endsWith(char)) {
        if (text.length > 0 && !text.endsWith(" ")) {
          editor.commands.insertContent(` ${char}`);
        } else {
          editor.commands.insertContent(char);
        }
      }
    },
    [editor],
  );

  return (
    <InputBoxDiv
      border={props.border}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      className="cursor-text"
      onClick={() => {
        editor && editor.commands.focus();
      }}
      onDragOver={(event: any) => {
        event.preventDefault();
        setShowDragOverMsg(true);
      }}
      onDragLeave={(e: any) => {
        if (e.relatedTarget === null) {
          if (e.shiftKey) {
            setShowDragOverMsg(false);
          } else {
            setTimeout(() => setShowDragOverMsg(false), 2000);
          }
        }
      }}
      onDragEnter={() => {
        setShowDragOverMsg(true);
      }}
      onDrop={(event: any) => {
        if (
            false
        //   !modelSupportsImages(
        //     defaultModel.provider,
        //     defaultModel.model,
        //     defaultModel.title,
        //     defaultModel.capabilities,
        //   )
        ) {
          return;
        }
        setShowDragOverMsg(false);
        let file = event.dataTransfer.files[0];
        // @ts-ignore
        handleImageFile(file).then(([img, dataUrl]) => {
          const { schema } = editor.state;
          const node = schema.nodes.image.create({ src: dataUrl });
          const tr = editor.state.tr.insert(0, node);
          editor.view.dispatch(tr);
        });
        event.preventDefault();
      }}
    >
      <div>{props.header}</div>

      <PaddingDiv>
        <EditorContent
          spellCheck={false}
          editor={editor}
          onClick={(event: any) => {
            event.stopPropagation();
          }}
        />
        <InputToolbar
          toolbarOptions={props.toolbarOptions}
          activeKey={activeKey}
          hidden={shouldHideToolbar && !props.isMainInput}
          onAddContextItem={() => insertCharacterWithWhitespace("@")}
          onAddSlashCommand={() => insertCharacterWithWhitespace("/")}
          onEnter={onEnterRef.current}
          onImageFileSelected={(file: any) => {
            // @ts-ignore
            handleImageFile(file).then(([img, dataUrl]) => {
              const { schema } = editor.state;
              const node = schema.nodes.image.create({ src: dataUrl });
              editor.commands.command(({ tr }) => {
                tr.insert(0, node);
                return true;
              });
            });
          }}
          disabled={active}
        />
      </PaddingDiv>
      {showDragOverMsg && (
          <>
            <HoverDiv></HoverDiv>
            <HoverTextDiv>Hold ⇧ to drop image</HoverTextDiv>
          </>
        )}
      {/* {showDragOverMsg &&
        modelSupportsImages(
          defaultModel.provider,
          defaultModel.model,
          defaultModel.title,
          defaultModel.capabilities,
        ) && (
          <>
            <HoverDiv></HoverDiv>
            <HoverTextDiv>Hold ⇧ to drop image</HoverTextDiv>
          </>
        )} */}
    </InputBoxDiv>
  );
}

export default TipTapEditor;
