import fs from "fs";

import { PaperEntity } from "@/models/paper-entity";
import { eraseProtocol, getFileType, getProtocol } from "@/utils/url";

import { AbstractEntryScraper } from "./entry-scraper";

export interface IZoteroCSVEntryScraperPayload {
  type: "file";
  value: string;
}

export class ZoteroCSVEntryScraper extends AbstractEntryScraper {
  static validPayload(payload: any): boolean {
    if (
      !payload.hasOwnProperty("type") ||
      !payload.hasOwnProperty("value") ||
      payload.type !== "file"
    ) {
      return false;
    }
    if (
      (getProtocol(payload.value) === "file" ||
        getProtocol(payload.value) === "") &&
      getFileType(payload.value) === "csv"
    ) {
      // read first line
      const fileContent = fs.readFileSync(eraseProtocol(payload.value), "utf8");
      const firstLine = fileContent.split("\n")[0];
      if (firstLine.includes("Item Type")) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
  static async scrape(
    payload: IZoteroCSVEntryScraperPayload
  ): Promise<PaperEntity[]> {
    if (!this.validPayload(payload)) {
      return [];
    }

    const data = fs.readFileSync(eraseProtocol(payload.value), "utf8");
    let dataList = data.split("\n");

    const keys = dataList[0].split('","');
    const values = dataList.slice(1).map((line) => {
      if (line) {
        const vs = line.split('","');
        return vs.reduce((acc, v, i) => {
          acc[keys[i]] = v === '""' ? "" : v;
          return acc;
        }, {} as any);
      }
    });

    let paperEntityDrafts: PaperEntity[] = [];
    for (const value of values) {
      try {
        if (value) {
          const paperEntityDraft = new PaperEntity(true);
          paperEntityDraft.setValue("title", value.Title);
          if (value.Author) {
            const authors = value.Author.split(";")
              .map((author: string) => {
                if (author.trim()) {
                  const first_last = author.split(",").map((author: string) => {
                    return author.trim();
                  });
                  first_last.reverse();
                  return first_last.join(" ");
                }
              })
              .join(", ");
            paperEntityDraft.setValue("authors", authors);
          }
          paperEntityDraft.setValue("publication", value["Publication Title"]);
          paperEntityDraft.setValue("pubTime", value["Publication Year"]);
          paperEntityDraft.setValue("doi", value["DOI"]);
          paperEntityDraft.setValue("addTime", new Date(value["Date Added"]));
          const pubType = [
            "journalArticle",
            "conferencePaper",
            "others",
            "book",
          ].indexOf(value["Item Type"]);
          paperEntityDraft.setValue("pubType", pubType > -1 ? pubType : 2);
          const attachments = value["File Attachments"].split(";");
          const mainURL = attachments[0];
          let supURLs = attachments.slice(1).map((url: string) => url.trim());
          if (mainURL) {
            if (mainURL.endsWith(".pdf")) {
              paperEntityDraft.setValue("mainURL", mainURL);
            } else {
              supURLs.push(mainURL);
            }
          }
          if (supURLs.length > 0) {
            paperEntityDraft.setValue("supURLs", supURLs);
          }
          paperEntityDraft.setValue("pages", value["Pages"]);
          paperEntityDraft.setValue("volume", value["Volume"]);
          paperEntityDraft.setValue("number", value["Issue"]);
          paperEntityDraft.setValue("publisher", value["Publisher"]);

          paperEntityDrafts.push(paperEntityDraft);
        }
      } catch (e) {
        // TODO: use logger
        console.error(e);
      }
    }

    return paperEntityDrafts;
  }
}
