-- Daily calculations and vacation adjustments are immutable for the app runtime.
REVOKE UPDATE ON workshop."EmployeeLeaveDay", workshop."VacationAdjustment", workshop."EmployeeLeave", workshop."SalaryAdvance", workshop."AdvanceInstallment" FROM workshop_runtime;
GRANT UPDATE ("voidedAt","voidReason") ON workshop."EmployeeLeave" TO workshop_runtime;
GRANT UPDATE (version,"voidedAt","voidReason") ON workshop."SalaryAdvance" TO workshop_runtime;
GRANT UPDATE ("appliedOn","appliedBy","cancelledAt") ON workshop."AdvanceInstallment" TO workshop_runtime;
