export type ActionType = "add" | "update" | "delete";

export interface ActionHistoryRecord {
  id: string;
  actionType: ActionType;
  alreadyRolledBack: boolean;
  createdAt: string | Date;
  eventId: string;
  eventTitle: string;
  description?: string;
}
