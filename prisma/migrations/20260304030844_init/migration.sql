-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "themeColor" TEXT NOT NULL DEFAULT '#E8719F',
    "accentColor" TEXT NOT NULL DEFAULT '#D4956A',
    "closingDay" INTEGER NOT NULL DEFAULT 10,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL DEFAULT 'REGULAR',
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "defaultStart" TEXT NOT NULL DEFAULT '08:30',
    "defaultEnd" TEXT NOT NULL DEFAULT '17:30',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Staff_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "clockIn" TEXT,
    "clockOut" TEXT,
    "actualWorkHours" REAL NOT NULL DEFAULT 0,
    "breakHours" REAL NOT NULL DEFAULT 0,
    "overtimeHours" REAL NOT NULL DEFAULT 0,
    "shortTimeValue" REAL NOT NULL DEFAULT 0,
    "mealCount" INTEGER NOT NULL DEFAULT 0,
    "overtimeReason" TEXT,
    "overtimeMemo" TEXT,
    "hourlyLeave" REAL NOT NULL DEFAULT 0,
    "dayType" TEXT NOT NULL DEFAULT 'WORK',
    "specialLeaveNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CLOCKED_IN',
    "modifiedBy" TEXT,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Attendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "leaveDate" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "leaveHours" INTEGER,
    "halfDayPeriod" TEXT,
    "reason" TEXT,
    "sickDayNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "gcalEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaveRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeaveApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "actionedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaveApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LeaveRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "totalDays" REAL NOT NULL DEFAULT 0,
    "usedDays" REAL NOT NULL DEFAULT 0,
    "remainingDays" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeaveBalance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SettingMaster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SettingMaster_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_staffId_workDate_key" ON "Attendance"("staffId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveApproval_requestId_key" ON "LeaveApproval"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_staffId_fiscalYear_key" ON "LeaveBalance"("staffId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "SettingMaster_orgId_key_key" ON "SettingMaster"("orgId", "key");
