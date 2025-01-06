PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;

-- CreateTable
CREATE TABLE "Instance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "phone" TEXT
);

-- CreateTable
CREATE TABLE "AuthState" (
  "id" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "instanceId" TEXT NOT NULL,
  "data" BLOB NOT NULL,

  PRIMARY KEY ("id", "instanceId"),
  CONSTRAINT "AuthState_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chat" (
  "name" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,

  PRIMARY KEY ("id", "instanceId"),
  CONSTRAINT "Chat_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
