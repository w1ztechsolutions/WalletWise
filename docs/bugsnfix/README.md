# Bug Reports & Fixes Log

This directory tracks all encountered issues, build/runtime bugs, edge cases, root cause analyses, and solutions implemented during the development and maintenance of **WalletWise**.

---

### [BUG-001] Git dubious ownership detection on Windows during repository initialization
- **Date:** 2026-10-02
- **Severity:** Low
- **Symptoms / Error Message:**
  ```text
  fatal: detected dubious ownership in repository at 'C:/Users/WIZTECH SOLUTIONS/Desktop/Projects/WalletWise'
  'C:/Users/WIZTECH SOLUTIONS/Desktop/Projects/WalletWise' is owned by:
    CHINKO/wisdo (S-1-5-21-4258414097-639853180-76571453-1001)
  but the current user is:
    CHINKO/WIZTECH SOLUTIONS (S-1-5-21-4258414097-639853180-76571453-1007)
  ```
- **Root Cause:**
  Git security protections (introduced in CVE-2022-24765) prevent Git commands in directories where the folder owner SID does not match the active shell execution user SID.
- **Fix Implemented:**
  Executed `git config --global --add safe.directory "C:/Users/WIZTECH SOLUTIONS/Desktop/Projects/WalletWise"`.
- **Verification:**
  `git status` and `git commit` succeeded immediately with clean root-commit creation.
