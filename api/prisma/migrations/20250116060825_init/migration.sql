-- CreateTable
CREATE TABLE "Instance" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,

    CONSTRAINT "Instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id","instanceId")
);

-- CreateTable
CREATE TABLE "Chat" (
    "name" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "participants" JSON NOT NULL DEFAULT '[]',

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id","instanceId")
);

-- CreateTable
CREATE TABLE "Scheduler_Instance" (
    "instanceId" TEXT NOT NULL,
    "schedulerId" TEXT NOT NULL,

    CONSTRAINT "Scheduler_Instance_pkey" PRIMARY KEY ("instanceId","schedulerId")
);

-- CreateTable
CREATE TABLE "Scheduler" (
    "id" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockAdms" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "messages" JSON NOT NULL,
    "minTimeBetweenParticipants" INTEGER NOT NULL,
    "maxTimeBetweenParticipants" INTEGER NOT NULL,
    "groupSize" INTEGER NOT NULL,
    "groupDelay" INTEGER NOT NULL,
    "minTimeTyping" INTEGER NOT NULL,
    "maxTimeTyping" INTEGER NOT NULL,

    CONSTRAINT "Scheduler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "jid" TEXT NOT NULL,
    "schedulerId" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "queueId" TEXT NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("jid","schedulerId")
);

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scheduler_Instance" ADD CONSTRAINT "Scheduler_Instance_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scheduler_Instance" ADD CONSTRAINT "Scheduler_Instance_schedulerId_fkey" FOREIGN KEY ("schedulerId") REFERENCES "Scheduler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_schedulerId_fkey" FOREIGN KEY ("schedulerId") REFERENCES "Scheduler"("id") ON DELETE CASCADE ON UPDATE CASCADE;
