import { Agent } from "@atproto/api";

const LIST_COLLECTION = "app.bsky.graph.listitem";

export class ListManager {
  private agent: Agent;
  private listUri: string;
  private ownerDid: string;

  constructor(agent: Agent, listUri: string, ownerDid: string) {
    this.agent = agent;
    this.listUri = listUri;
    this.ownerDid = ownerDid;
  }

  /** Fetch all current list member DIDs. Returns Map of DID → record URI. */
  async getExistingMembers(): Promise<Map<string, string>> {
    const members = new Map<string, string>();
    let cursor: string | undefined;

    do {
      const response = await this.agent.com.atproto.repo.listRecords({
        repo: this.ownerDid,
        collection: LIST_COLLECTION,
        limit: 100,
        cursor,
      });

      for (const record of response.data.records) {
        const value = record.value as { subject?: string; list?: string };
        if (value.list === this.listUri && value.subject) {
          members.set(value.subject, record.uri);
        }
      }

      cursor = response.data.cursor;
    } while (cursor);

    return members;
  }

  /** Add a DID to the list. */
  async addMember(subjectDid: string): Promise<void> {
    await this.agent.com.atproto.repo.createRecord({
      repo: this.ownerDid,
      collection: LIST_COLLECTION,
      record: {
        $type: LIST_COLLECTION,
        subject: subjectDid,
        list: this.listUri,
        createdAt: new Date().toISOString(),
      },
    });
  }

  /** Remove a member by their record URI. */
  async removeMember(recordUri: string): Promise<void> {
    const rkey = recordUri.split("/").pop()!;
    await this.agent.com.atproto.repo.deleteRecord({
      repo: this.ownerDid,
      collection: LIST_COLLECTION,
      rkey,
    });
  }

  /** Remove a member by DID. Returns true if found and removed. */
  async removeMemberByDid(subjectDid: string): Promise<boolean> {
    const members = await this.getExistingMembers();
    const recordUri = members.get(subjectDid);
    if (!recordUri) return false;
    await this.removeMember(recordUri);
    return true;
  }
}
