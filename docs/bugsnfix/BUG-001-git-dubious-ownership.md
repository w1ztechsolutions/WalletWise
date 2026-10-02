# BUG-001: Git Dubious Ownership Detection on Windows During Init

- **Date:** 2026-10-02
- **Severity:** Low
- **Component:** Git Repository & Local Workspace Environment
- **Status:** Resolved

---

## 1. Symptoms & Error Message

When running `git init`, `git add`, or `git status` inside `C:/Users/WIZTECH SOLUTIONS/Desktop/Projects/WalletWise`, Git failed with:

```text
fatal: detected dubious ownership in repository at 'C:/Users/WIZTECH SOLUTIONS/Desktop/Projects/WalletWise'
'C:/Users/WIZTECH SOLUTIONS/Desktop/Projects/WalletWise' is owned by:
	CHINKO/wisdo (S-1-5-21-4258414097-639853180-76571453-1001)
but the current user is:
	CHINKO/WIZTECH SOLUTIONS (S-1-5-21-4258414097-639853180-76571453-1007)
To add an exception for this directory, call:

	git config --global --add safe.directory 'C:/Users/WIZTECH SOLUTIONS/Desktop/Projects/WalletWise'
```

---

## 2. Root Cause Analysis

Git security hardening (introduced in CVE-2022-24765) inspects directory ownership on Windows NTFS volumes. If the filesystem owner Security Identifier (SID) of the folder differs from the user running the Git process, Git refuses to operate within the folder to prevent malicious configuration exploitation.

---

## 3. Resolution & Code Changes

Added the repository path to the global safe directories registry:

```powershell
git config --global --add safe.directory "C:/Users/WIZTECH SOLUTIONS/Desktop/Projects/WalletWise"
```

---

## 4. Verification

Subsequent `git status`, `git add -A`, and `git commit` commands executed cleanly with root-commit creation.
