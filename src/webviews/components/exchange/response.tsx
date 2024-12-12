import * as React from 'react';
import {
  Response,
  ResponsePart,
  ToolParameter,
  ToolParameterType,
  ToolType,
  ToolTypeType,
  WorkspaceFolder,
} from '../../../model';
import MarkdownRenderer from '../markdown-renderer';
import { ContextSummary } from '../context-summary';
import { Exchange, ExchangeContent } from './exchange-base';
import FileIcon from 'components/fileicon';
import { TerminalPreview } from 'components/terminal-preview';
import { Spinner } from 'components/spinner';
import { AppState } from 'app';
import { Button } from 'components/button';

const toolTypesInfo: Record<ToolType, { label: string; codiconId: string }> = {
  [ToolType.AskFollowupQuestions]: { label: 'Follow up question', codiconId: 'comment-discussion' },
  [ToolType.ListFiles]: { label: 'List files', codiconId: 'search' },
  [ToolType.OpenFile]: { label: 'Reading', codiconId: 'folder-opened' },
  [ToolType.SearchFileContentWithRegex]: {
    label: 'Search content file with regex',
    codiconId: 'regex',
  },
  [ToolType.TerminalCommand]: { label: 'Terminal command', codiconId: 'terminal' },
  [ToolType.CodeEditing]: { label: 'Editing', codiconId: 'code' },
  [ToolType.LSPDiagnostics]: { label: 'LSP Diagnostics', codiconId: 'checklist' },
  [ToolType.AttemptCompletion]: { label: 'Attempt completion', codiconId: 'wand' },
  [ToolType.RepoMapGeneration]: { label: 'Repo map generation', codiconId: 'folder-library' },
};

function getRelativePath(workspaceFoldersPaths: WorkspaceFolder[], path: string) {
  // Workspace roots should be ordered by depth
  for (const workspaceFoldersPath of workspaceFoldersPaths) {
    if (workspaceFoldersPath.fsPath === path) {
      return workspaceFoldersPath.name;
    }
    if (path.startsWith(workspaceFoldersPath.fsPath)) {
      return path.replace(`${workspaceFoldersPath.fsPath}/`, '');
    }
  }

  return path;
}

function ParameterContent({
  type,
  content,
  delta,
}: {
  type: ToolParameterType;
  content: string;
  delta: string;
}) {
  function handleOpenFile() {
    if (type === ToolParameter.FSFilePath) {
      vscode.postMessage({
        type: 'open-file',
        fs_file_path: content,
      });
    }
  }

  const { workspaceFolders } = React.useContext(AppState);

  switch (type) {
    case ToolParameter.FSFilePath:
      return (
        <button
          onClick={handleOpenFile}
          className="group flex w-full gap-2 border-description text-start text-sm text-description"
        >
          <div className="flex-shrink-0 -translate-x-1">
            <FileIcon height="22px" width="22px" filename={content} />
          </div>
          <span className="w-0 flex-grow -translate-x-1.5 overflow-hidden text-ellipsis whitespace-nowrap group-hover:underline">
            {/*content.split(/[/\\]/).pop()*/}
            {workspaceFolders ? getRelativePath(workspaceFolders, content) : content}
          </span>
        </button>
      );
    case ToolParameter.DirectoryPath:
      return (
        <button
          onClick={handleOpenFile}
          className="flex w-full gap-2 border-description text-start text-sm text-description"
        >
          <span
            aria-hidden
            className="codicon codicon-folder-opened flex-shrink-0 translate-y-0.5"
          />
          <span className="w-0 flex-grow overflow-hidden text-ellipsis whitespace-nowrap">
            {workspaceFolders ? getRelativePath(workspaceFolders, content) : content}
          </span>
        </button>
      );

    case ToolParameter.Instruction:
      return (
        <div className="prose prose-invert prose-sm">
          <MarkdownRenderer rawMarkdown={content} />
        </div>
      );

    case ToolParameter.Command:
      return <TerminalPreview lines={content.split('\n')} busy={false} />;

    case ToolParameter.Question:
      return (
        <div className="relative isolate px-3 py-2">
          <div className="absolute inset-0 -z-10 bg-accent opacity-10" />
          <div className="absolute inset-0 -z-10 border-l-2 border-accent opacity-50" />
          <div className="text-foreground">{content}</div>
        </div>
      );

    case ToolParameter.Result:
      return (
        <div className="relative isolate p-3 text-foreground">
          <div className="absolute inset-0 -z-10 bg-success opacity-10" />
          <div className="absolute inset-0 -z-10 border-l-2 border-success opacity-50" />
          <MarkdownRenderer rawMarkdown={content} />
        </div>
      );

    case ToolParameter.RegexPattern:
    case ToolParameter.FilePattern:
      return <TerminalPreview lines={content.split('\n')} busy={false} />;

    /*<pre className="relative isolate rounded-xs bg-input-background p-2 text-xs">
          <div className="absolute inset-0 -z-10 rounded-xs border border-input-border opacity-50" />
          {content.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </pre>*/

    case ToolParameter.Recursive:
      return (
        <div className="relative isolate rounded-xs p-2 text-xs">
          <div className="absolute inset-0 -z-10 rounded-xs bg-terminal-background opacity-50" />
          <span className="text-description">Recursive: </span>
          {content === 'true' ? 'Yes' : 'No'}
        </div>
      );

    default:
      return (
        <div className="p-2 text-sm">
          {content.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      );
  }
}

function OutputContent({ type, content }: { type: ToolTypeType; content: string }) {
  const { label, codiconId } = toolTypesInfo[type];

  const [isOpen, setIsOpen] = React.useState(false);

  switch (type) {
    default:
      return (
        <div className="group relative isolate -mt-0.5">
          <div className="absolute -inset-x-2 inset-y-0 -z-10 rounded-xs border border-transparent bg-terminal-background opacity-25 brightness-75 transition-all group-hover:border-terminal-border group-hover:brightness-100" />
          <details className="group relative isolate -m-2 flex flex-col whitespace-nowrap p-2 pt-2.5 text-xs text-description">
            <summary className="flex cursor-pointer items-center gap-1">
              {/* <span
                aria-hidden
                className={`codicon flex-shrink-0 opacity-60 codicon-${codiconId}`}
              /> */}
              View {label} ouput
              <span className="aria-hidden codicon codicon-chevron-down" />
            </summary>
            <div className="absolute inset-0 -z-10 rounded-xs border border-terminal-border bg-terminal-background opacity-25 brightness-100 transition-all" />
            <pre className="mt-2 flex w-full flex-col gap-2 overflow-auto text-terminal-foreground">
              {content}
            </pre>
          </details>
        </div>
      );
  }
}

export function ResponseViewItem(props: Response) {
  const { parts, context, exchangeId, sessionId } = props;
  const [showFollowup, setShowFollowup] = React.useState(false);
  const [followupText, setFollowupText] = React.useState('');

  const handleFollowup = () => {
    if (followupText.trim()) {
      vscode.postMessage({
        type: 'followup-request',
        query: followupText,
        exchangeId,
        sessionId,
      });
      setFollowupText('');
      setShowFollowup(false);
    }
  };

  return (
    <Exchange>
      <ExchangeContent className="mt flex flex-col gap-2">
        {parts.length > 0 &&
          parts.map((part, index) => (
            <React.Fragment key={`${part.type}-${index}`}>
              {renderPart(part, index, parts)}
              {renderParameter(part)}
              {renderToolOutput(part)}
            </React.Fragment>
          ))}
        {context.length > 0 && <ContextSummary context={context} />}
        <div className="mt-2 flex flex-col gap-2">
          {!showFollowup ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowFollowup(true)}
              className="w-fit"
            >
              <span className="codicon codicon-comment-discussion" />
              Ask followup question
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                className="w-full rounded-xs border border-input-border bg-input-background p-2 text-sm text-foreground"
                placeholder="Type your followup question..."
                value={followupText}
                onChange={(e) => setFollowupText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleFollowup();
                  }
                }}
                rows={2}
              />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handleFollowup}>
                  Send
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowFollowup(false);
                    setFollowupText('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </ExchangeContent>
    </Exchange>
  );
}

function renderParameter(responsePart: ResponsePart) {
  if (responsePart.type === 'toolParameter') {
    const { parameterName, contentDelta, contentUpUntilNow } = responsePart.toolParameters;
    return (
      <div>
        <span className="sr-only">{parameterName}</span>
        <ParameterContent type={parameterName} content={contentUpUntilNow} delta={contentDelta} />
      </div>
    );
  }
  return null;
}

function renderToolOutput(responsePart: ResponsePart) {
  if (responsePart.type === 'toolOutput' && responsePart.toolOutput.contentUpUntilNow) {
    const { toolType, contentDelta, contentUpUntilNow } = responsePart.toolOutput;
    return (
      <div>
        <span className="sr-only">{toolType}</span>
        <OutputContent type={toolType} content={contentUpUntilNow} />
      </div>
    );
  }
  return null;
}

function renderPart(part: ResponsePart, index: number, allParts: ResponsePart[]) {
  const nextPart = allParts[index + 1];
  const isThinkingFollowedByTool =
    part.type === 'toolThinking' && nextPart && nextPart.type === 'toolType';

  switch (part.type) {
    case 'markdown':
      return <MarkdownRenderer rawMarkdown={part.rawMarkdown} />;
    case 'commandGroup':
      return (
        <div className="flex flex-wrap gap-2">
          {part.commands.map((command) => (
            <pre // Why was this a button?
              key={command.command}
              className="flex gap-2 rounded-xs border border-terminal-border bg-terminal-background px-2 py-1.5"
            >
              {command.title}
            </pre>
          ))}
        </div>
      );
    case 'toolThinking':
      return (
        <div className="flex items-start gap-3 text-sm text-description">
          {!isThinkingFollowedByTool && <Spinner />}
          <div className="flex-1">
            {part.markdown.rawMarkdown ? (
              <MarkdownRenderer rawMarkdown={part.markdown.rawMarkdown} />
            ) : (
              <span>Thinking...</span>
            )}
          </div>
        </div>
      );
    case 'toolType': {
      const { label, codiconId } = toolTypesInfo[part.toolType];
      return (
        <div className="mt-4 flex gap-1 pr-2 text-description">
          <span
            aria-hidden
            className={`codicon flex-shrink-0 translate-y-0.5 opacity-60 codicon-${codiconId}`}
          />
          <span className="text-sm opacity-75">{label}</span>
        </div>
      );
    }
    case 'tool-not-found': {
      return (
        <div className="relative isolate p-3 text-foreground">
          <div className="absolute inset-0 -z-10 bg-error opacity-10" />
          <div className="absolute inset-0 -z-10 border-l-2 border-error opacity-50" />
          <MarkdownRenderer rawMarkdown={part.output} />
        </div>
      );
    }
    default:
      return null;
  }
}
