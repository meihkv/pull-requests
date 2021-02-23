import { DocumentRegistry } from '@jupyterlab/docregistry';
import { ActionButton } from '@jupyterlab/git/lib/components/ActionButton';
import {
  caretDownIcon,
  caretUpIcon,
  linkIcon
} from '@jupyterlab/ui-components';
import { CommandRegistry } from '@lumino/commands';
import React, { useEffect, useState } from 'react';
import { BeatLoader } from 'react-spinners';
import { CommandIDs, IFile, IPullRequest } from '../../tokens';
import { requestAPI } from '../../utils';
import { PullRequestBrowserFileItem } from './PullRequestBrowserFileItem';

export interface IPullRequestItemProps {
  /**
   * Jupyter Front End Commands Registry
   */
  commands: CommandRegistry;
  docRegistry: DocumentRegistry;
  pullRequest: IPullRequest;
}

function openLink(link: string): void {
  window.open(link, '_blank');
}

export function PullRequestItem(props: IPullRequestItemProps): JSX.Element {
  const { commands, docRegistry, pullRequest } = props;
  const [files, setFiles] = useState<IFile[] | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFiles(null);
    setIsExpanded(false);
    setIsLoading(false);
    setError(null);
  }, [props.pullRequest]);

  const fetchFiles = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const results = (await requestAPI(
        'pullrequests/prs/files?id=' + encodeURIComponent(pullRequest.id),
        'GET'
      )) as any[];
      setFiles(
        results.map(
          (rawFile: any): IFile => {
            const path = rawFile.name;
            return {
              ...rawFile,
              fileType:
                docRegistry.getFileTypesForPath(path)[0] ||
                DocumentRegistry.defaultTextFileType
            };
          }
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // This makes a shallow copy of data[i], the data[i].files are not copied
  // If files need to be mutated, will need to restructure props / deep copy
  const toggleFilesExpanded = (): void => {
    if (files === null && !isExpanded) {
      setError(null);
      fetchFiles()
        .then(() => {
          setIsExpanded(!isExpanded);
        })
        .catch(reason => {
          setError(`Failed to get pull request files ${reason}`);
        });
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <li
      className="jp-PullRequestBrowserItemListItem"
      key={pullRequest.id}
      onClick={(): void => {
        commands.execute(CommandIDs.prOpenDescription, { pullRequest } as any);
      }}
    >
      <h2>{pullRequest.title}</h2>
      <div className="jp-PullRequestBrowserItemListItemIconWrapper">
        <ActionButton
          icon={linkIcon}
          onClick={(e): void => {
            e.stopPropagation();
            openLink(pullRequest.link);
          }}
          title="Open in new tab"
        />
        <ActionButton
          icon={isExpanded ? caretUpIcon : caretDownIcon}
          onClick={(e): void => {
            e.stopPropagation();
            toggleFilesExpanded();
          }}
          title={isExpanded ? 'Hide modified files' : 'Show modified files'}
        />
      </div>
      {isLoading ? (
        <BeatLoader
          sizeUnit={'px'}
          size={5}
          color={'var(--jp-ui-font-color1)'}
          loading={isLoading}
        />
      ) : (
        isExpanded &&
        (error ? (
          <div>
            <h2 className="jp-PullRequestBrowserItemError">
              Error Listing Pull Request Files:
            </h2>
            {error}
          </div>
        ) : (
          <ul className="jp-PullRequestBrowserItemFileList">
            {files?.map(file => (
              <li
                key={`${pullRequest.internalId}-${file.name}`}
                onClick={(e): void => {
                  e.stopPropagation();
                  commands.execute(CommandIDs.prOpenDiff, {
                    file,
                    pullRequest
                  } as any);
                }}
              >
                <PullRequestBrowserFileItem file={file} />
              </li>
            ))}
          </ul>
        ))
      )}
    </li>
  );
}
