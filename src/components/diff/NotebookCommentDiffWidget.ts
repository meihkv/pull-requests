import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { Panel, Widget } from '@lumino/widgets';
import { NotebookDiffModel } from 'nbdime/lib/diff/model';
import {
  CellDiffWidget,
  MetadataDiffWidget,
  NotebookDiffWidget
} from 'nbdime/lib/diff/widget';
import { CHUNK_PANEL_CLASS } from 'nbdime/lib/diff/widget/common';
import { IComment, IThread, IThreadCell } from '../../tokens';
import { generateNode } from '../../utils';
import { CommentThread } from './CommentThread';

export class NotebookCommentDiffWidget extends NotebookDiffWidget {
  constructor(
    prId: string,
    filename: string,
    model: NotebookDiffModel,
    comments: IThreadCell[],
    rendermime: IRenderMimeRegistry
  ) {
    super(model, rendermime);
    this._filename = filename;
    this._prId = prId;
    this.__renderMime = rendermime;
    this._threads = comments;
  }

  addComment(
    chunkIndex: number,
    widget: Panel,
    lineNo: number,
    side: 'line' | 'originalLine'
  ): void {
    const threadsForChunk = this._threads[chunkIndex].threads;
    const hasNewThread =
      threadsForChunk[threadsForChunk.length - 1]?.comments.length === 0;
    if (!hasNewThread) {
      const thread: IThread = {
        comments: new Array<IComment>(),
        pullRequestId: this._prId,
        filename: this._filename
      };
      thread[side] = lineNo + 1;
      threadsForChunk.push(thread);
      widget.addWidget(this.makeThreadWidget(thread, threadsForChunk));
    }
  }

  /**
   * Add widget to the panel
   *
   * If the widget is a cell diff, we add comments widget.
   *
   * @param widget Widget
   */
  addWidget(widget: Widget): void {
    if (
      widget instanceof CellDiffWidget ||
      widget.hasClass(CHUNK_PANEL_CLASS) ||
      widget instanceof MetadataDiffWidget
    ) {
      let currentPosition = this._chunkIndex;
      if (widget instanceof MetadataDiffWidget) {
        currentPosition = this._threads.length - 1;
      } else {
        this._chunkIndex += 1;
      }

      const commentButton = generateNode('div', {
        class: 'jp-PullRequestCellDiffCommentContainer'
      });

      const cellDiff = new Panel();
      cellDiff.addClass('jp-PullRequestCellDiffContent');
      cellDiff.addWidget(widget);
      cellDiff.addWidget(new Widget({ node: commentButton }));

      const chunkWidget = new Panel();
      chunkWidget.addWidget(cellDiff);

      this._threads[currentPosition].threads.forEach((thread, _, array) => {
        chunkWidget.addWidget(this.makeThreadWidget(thread, array));
      });

      const line = this._threads[currentPosition].range?.end;
      const originalLine = this._threads[currentPosition].originalRange?.end;

      commentButton
        .appendChild(
          generateNode(
            'div',
            { class: 'jp-PullRequestCellDiffComment' },
            null,
            {
              click: () =>
                this.addComment(
                  currentPosition,
                  chunkWidget,
                  line || originalLine || 0,
                  line ? 'line' : 'originalLine'
                )
            }
          )
        )
        .appendChild(
          generateNode('div', { class: 'jp-PullRequestCommentDecoration' })
        );

      widget = chunkWidget;
    }
    super.addWidget(widget);
  }

  private makeThreadWidget(thread: IThread, threads: IThread[]): Widget {
    const widget = new CommentThread({
      renderMime: this.__renderMime,
      thread,
      handleRemove: (): void => {
        const threadIndex = threads.findIndex(
          thread_ => thread.id === thread_.id
        );
        threads.splice(threadIndex, 1);
        widget.parent = null;
        widget.dispose();
      }
    });

    return widget;
  }

  protected _filename: string;
  protected _prId: string;
  protected __renderMime: IRenderMimeRegistry;
  protected _threads: IThreadCell[];
  // Current chunk position
  private _chunkIndex = 0;
}
