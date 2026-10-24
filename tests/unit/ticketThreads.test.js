const { test, eq } = require("./_harness");
const {
  addTicketMember,
  cleanupTicketThread,
  _internals,
} = require("../../src/systems/ticketThreads");

test("ticket opener is added before ticket creation continues", async () => {
  let addedUserId = null;
  let archived = false;
  const result = await addTicketMember(
    {
      members: {
        add: async (userId) => {
          addedUserId = userId;
        },
      },
      setArchived: async () => {
        archived = true;
      },
    },
    "user-1",
  );

  eq(result, true);
  eq(addedUserId, "user-1");
  eq(archived, false);
});

test("ticket thread is archived when adding its opener fails", async () => {
  let archiveReason = null;
  const result = await addTicketMember(
    {
      members: {
        add: async () => {
          throw new Error("permission denied");
        },
      },
      setArchived: async (archived, reason) => {
        if (archived) archiveReason = reason;
      },
    },
    "user-1",
  );

  eq(result, false);
  eq(archiveReason, "Failed to add ticket opener");
});

test("ticket thread is deleted if it cannot be archived after member-add failure", async () => {
  let deleted = false;
  const result = await addTicketMember(
    {
      members: {
        add: async () => {
          throw new Error("permission denied");
        },
      },
      setArchived: async () => {
        throw new Error("archive failed");
      },
      delete: async () => {
        deleted = true;
      },
    },
    "user-1",
  );

  eq(result, false);
  eq(deleted, true);
});

test("ticket persistence cleanup deletes the thread if archive fails", async () => {
  let deleteReason = null;
  const cleaned = await cleanupTicketThread(
    {
      setArchived: async () => {
        throw new Error("archive unavailable");
      },
      delete: async (reason) => {
        deleteReason = reason;
      },
    },
    "Failed to persist ticket",
  );

  eq(cleaned, true);
  eq(deleteReason, "Failed to persist ticket");
});

test("expired ticket-open dedupe entries are pruned without another lookup", () => {
  const cache = new Map([
    ["expired", 100],
    ["recent", 9_000],
  ]);

  _internals.pruneRecentOpenCache(cache, 10_000, 5_000);

  eq(cache.has("expired"), false);
  eq(cache.has("recent"), true);
});
