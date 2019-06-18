import { isUndefined } from "lodash";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { PullRequestCommentThread } from "./components/diff/PullRequestCommentThread";
import { PlainDiffComponent } from "./components/diff/PlainDiffComponent";
import { doRequest } from "./utils";

// -----------------------------------------------------------------------------
// Pull Request Model
// -----------------------------------------------------------------------------

// A class for the neccessary items in GitHub PR json response
// Extendable to other source control libraries (eg CodeCommit) in the future
export class PullRequestModel {

  constructor(id: string, title: string, body: string, internalId: string) {
    this.id = id;
    this.title = title;
    this.body = body;
    this.internalId = internalId;
    this.isExpanded = false;
  }

  async getFiles(): Promise<void> {
    let jsonresults = await doRequest("pullrequests/prs/files?id=" + this.id, "GET");
    let results: PullRequestFileModel[] = [];
    for (let jsonresult of jsonresults) {
      results.push(
        new PullRequestFileModel(
          jsonresult["name"],
          jsonresult["status"], 
          this
        )
      );
    }
    this.files = results;
  }

  id: string;
  title: string;
  body: string;
  internalId: string;
  files: PullRequestFileModel[];
  isExpanded: boolean;
}


// -----------------------------------------------------------------------------
// File Model
// -----------------------------------------------------------------------------

export class PullRequestFileModel {

  constructor(name: string, status: string, pr: PullRequestModel) {
    this.name = name;
    this.status = status;
    this.pr = pr;
    this.id = this.pr.internalId + "-" + this.name;
    this.extension = this.getExtension(this.name);
  }

  async loadFile(): Promise<void> {
    let jsonresults = await doRequest(`pullrequests/files/content?id=${this.pr.id}&filename=${this.name}`, "GET");
    this.commitId = jsonresults["commit_id"];
    this.basecontent = jsonresults["base_content"];
    this.headcontent = jsonresults["head_content"];
  }

  async loadComments() {
    let jsonresults = await doRequest(`pullrequests/files/comments?id=${this.pr.id}&filename=${this.name}`, "GET");
    let results: PullRequestCommentModel[] = [];
    for (let jsonresult of jsonresults) {
      const item: PullRequestCommentModel = {
        id: jsonresult["id"],
        text: jsonresult["text"],
        lineNumber: jsonresult["line_number"],
        username: jsonresult["user_name"],
        userpic: jsonresult["user_pic"],
        replies: []
      };
      if (!isUndefined(jsonresult["in_reply_to_id"])) {
        for (let result of results) {
          if (result.id == jsonresult["in_reply_to_id"]) {
            result.replies.push(item);
          }
        }
      } else {
        results.push(item);
      }
    }
    this.comments = results;
  }

  private getExtension(filename: string): string {
    return `.${filename.substring(
      filename.lastIndexOf(".") + 1,
      filename.length
    ) || filename}`;
  }

  id: string;
  name: string;
  status: string;
  commitId: string;
  extension: string;
  basecontent: string;
  headcontent: string;
  pr: PullRequestModel;
  comments: PullRequestCommentModel[];
}


// -----------------------------------------------------------------------------
// Comment Model
// -----------------------------------------------------------------------------

export interface PullRequestCommentModel {
  id: number;
  lineNumber: number;
  text: string;
  username: string;
  userpic?: string;
  replies: PullRequestCommentModel[];
}

export class PullRequestCommentThreadModel {

  constructor(file: PullRequestFileModel, given: number | PullRequestCommentModel) {
    this.prid = file.pr.id;
    this.filename = file.name;
    this.commitId = file.commitId;
    if (typeof(given) === "number") {
      this.lineNumber = given;
      this.comments = null;
    } else {
      this.lineNumber = given.lineNumber;
      this.comments = given;
    }
    this.id = file.id + "-" + this.lineNumber;
  }

  getCommentReplyBody(text: string): any {
    const request = {
      "text": text,
      "in_reply_to": this.comments.id
    };
    return request;
  }

  getCommentNewBody(text: string): any {
    const request = {
      "text": text,
      "filename": this.filename,
      "position": this.lineNumber,
      "commit_id": this.commitId
    };
    return request;
  }

  async postComment(body: any) {
    let jsonresult = await doRequest(`pullrequests/files/comments?id=${this.prid}&filename=${this.filename}`, "POST", body);
    const item: PullRequestCommentModel = {
      id: jsonresult["id"],
      text: jsonresult["text"],
      lineNumber: jsonresult["line_number"],
      username: jsonresult["user_name"],
      userpic: jsonresult["user_pic"],
      replies: []
    };
    if (this.comments == null) {
      this.comments = item;
    } else {
      this.comments.replies.push(item);
    }
  }

  id: string;
  prid: string;
  filename: string;
  commitId: string;
  lineNumber: number;
  comments: PullRequestCommentModel;
}

/**
 * A Monaco plain diff specific implementation of comments
 * @remarks
 * Uses trick from https://github.com/microsoft/monaco-editor/issues/373 (used for Monaco error overlays)
 * 1) Insert a view zone to reserve a vertical gap in the text
 * 2) Inserts an overlay widget that is kept position-wise in sync with the view zone
 */
export class PullRequestPlainDiffCommentThreadModel {

  constructor(thread: PullRequestCommentThreadModel, plainDiff: PlainDiffComponent) {
    this.thread = thread;
    this.plainDiff = plainDiff;
    this.viewZoneId = null;
    this.domNode = null;
    this.initComment();
  }

  initComment() {
    let overlayDom = document.createElement('div');
    overlayDom.style.width = '100%';
    overlayDom.style.visibility = 'visible';

    let overlayWidget = {
      getId: () => 'overlay.zone.widget.' + this.thread.id,
      getDomNode: () => overlayDom,
      getPosition: (): any => null
    };
    this.plainDiff.state.diffEditor.getModifiedEditor().addOverlayWidget(overlayWidget);

    ReactDOM.render(<PullRequestCommentThread thread={this.thread}  plainDiff={this} />, overlayDom, () => {
      this.domNode = overlayDom;
      setTimeout(() => this.addToEditor(), 0);
    });
  }

  deleteComment() {
    this.removeFromEditor();
    this.domNode.remove();
  }

  toggleUpdate() {
    this.removeFromEditor();
    this.addToEditor();
  }

  private addToEditor() {
    let zoneNode = document.createElement('div');
    zoneNode.id = this.thread.id;
    let marginZoneNode = document.createElement('div');

    this.plainDiff.state.diffEditor.getModifiedEditor().changeViewZones((changeAccessor) => {
      this.viewZoneId = changeAccessor.addZone({
        afterLineNumber: this.thread.lineNumber,
        heightInPx: this.domNode.clientHeight,
        domNode: zoneNode,
        marginDomNode: marginZoneNode,
        onDomNodeTop: top => {
          this.domNode.style.top = top + "px";
          this.domNode.style.visibility = "visible";
        }
      });
    });
  }

  private removeFromEditor() {
    const tempViewZoneId = this.viewZoneId;
    this.plainDiff.state.diffEditor.getModifiedEditor().changeViewZones(function(changeAccessor) {
      changeAccessor.removeZone(tempViewZoneId);
    });
    this.viewZoneId = null;
  }

  viewZoneId: number;
  domNode: HTMLElement;
  plainDiff: PlainDiffComponent;
  thread: PullRequestCommentThreadModel;
}