# AsiTeamLink — Internal Security Assessment

> **Purpose:** This document serves as an internal risk and compliance assessment for AsiTeamLink.  
> **Audience:** IT, Compliance, and Management teams.  
> **Assessment Date:** May 12, 2026  
> **Version:** 1.0

---

## 1. Risk Area Checklist

| # | Risk Area | Present / Controlled? | Notes |
|---|-----------|----------------------|-------|
| 1 | **Leakage of client/customer information** | **Partial** | Row-Level Security (RLS) policies are in place on Supabase, but the Next.js middleware is currently **temporarily disabled** for debugging purposes. Route-level protection relies on server-side role checks per API endpoint. |
| 2 | **Unauthorized access** | **Yes** | Email/password login with OTP verification on new/unrecognized devices. MFA (email OTP + TOTP) is supported. User accounts require admin approval before access is granted. |
| 3 | **Screenshots / file sharing** | **Partial** | File uploads are tracked in `file_audit_logs` (upload, download, view, delete). Screenshots cannot be technically prevented in a web application; this is a policy control, not a system control. |
| 4 | **External access** | **Partial** | The app is web-based and accessible from any browser. There is no IP allowlisting or VPN enforcement in place. Access control relies on authentication and role checks only. |
| 5 | **Message retention** | **Yes** | Messages are persisted in the database. Soft-deleted messages are flagged (`is_deleted`, `deleted_at`, `deleted_by`) and logged to `deletion_audit_logs`. Permanent deletion is also audited. |
| 6 | **Audit logs** | **Yes** | Three audit log types are implemented: login/authentication logs, deletion logs, and file operation logs. Accessible via the Compliance dashboard. |
| 7 | **Deletion capability** | **Yes** | Admins and authorized roles can delete messages and files. All deletions are recorded in `deletion_audit_logs` with user ID, entity type, reason, and timestamp. |
| 8 | **User permissions** | **Yes** | Five roles are defined: `admin`, `manager`, `tl` (team leader), `agent`, `compliance`. Access to features and data is gated by role. Compliance role has read-only access to audit dashboards. |
| 9 | **Malware / file upload risks** | **Partial** | Upload API enforces a MIME-type whitelist and a 5 MB file size limit. Archives (ZIP, RAR, 7Z) are allowed. No server-side antivirus/malware scanning is currently performed on uploaded files. |
| 10 | **Use on personal devices** | **Partial** | The app is browser-based and can be accessed on personal devices. No MDM (Mobile Device Management) or device restriction policy is enforced at the application level. |
| 11 | **Integration with email or external apps** | **Yes** | The following external integrations are active: email (OTP delivery, password reset, account verification), Giphy API (GIF search in chat), Jitsi Meet (video calls via `meet.ffmuc.net`), and LanguageTool API (spell-check). |

---

## 2. IT & Compliance Checklist

| # | Question | Answer | Details |
|---|----------|--------|---------|
| 1 | **Is login secured?** | **Yes** | Password-based login is combined with OTP verification for new/unrecognized devices. MFA (email OTP or TOTP authenticator app) is supported and configurable per user. Login attempts (success and failure) are recorded in `login_audit_logs` with IP address, device name, and method. |
| 2 | **Are messages encrypted?** | **Partial** | Data is encrypted **in transit** via HTTPS (Supabase enforces TLS). Data is encrypted **at rest** by Supabase's managed PostgreSQL infrastructure. Messages are **not** end-to-end encrypted at the application layer; the server and database administrators can read plaintext messages. |
| 3 | **Can employees export chats/files?** | **Partial** | Users can download shared files from the chat. There is no built-in bulk chat export feature. All file download actions are logged in `file_audit_logs`. The compliance audit dashboard allows authorized roles to export log data. |
| 4 | **Is there audit logging?** | **Yes** | Three audit log modules are operational: (1) **Login Audits** — tracks authentication attempts with IP, device, method, and outcome; (2) **Deletion Audits** — tracks message/file/channel deletions with actor and reason; (3) **File Audits** — tracks upload, download, view, and delete operations per file. |
| 5 | **Can admins monitor activities?** | **Yes** | Users with `admin` or `compliance` roles have access to the Compliance & Auditing dashboard, which provides filterable, date-ranged views of all three audit log types. Online/offline user status is also tracked in real time. |
| 6 | **Is there role-based access?** | **Yes** | Five distinct roles: `admin` (full access), `manager`, `tl` (team leader), `agent` (standard user), and `compliance` (audit-only access). Role assignment is managed by admins. Channel membership is also controlled by role/campaign assignment. |
| 7 | **Is there auto logout?** | **No** | There is currently no inactivity-based automatic session timeout implemented in the application. Session management is handled by Supabase Auth with its default token lifespan. **Recommendation:** Implement an inactivity timer to log out idle sessions. |
| 8 | **Where is data stored?** | **Supabase (Cloud)** | All messages, user data, and metadata are stored in a Supabase-managed PostgreSQL database. File attachments are stored in Supabase Storage. The hosting region depends on the Supabase project configuration. |
| 9 | **Is there backup?** | **Partial** | Supabase provides automated daily database backups on paid plans. File storage backups depend on the Supabase plan tier. No application-level custom backup or export routine is currently implemented. |
| 10 | **Can former employees still access it?** | **Partial** | User accounts have an `approved / rejected / pending` status. An admin must manually set a former employee's account to `rejected` to revoke access. There is no automated offboarding or account deactivation workflow triggered by HR systems. **Recommendation:** Establish a formal offboarding process to revoke access on the same day of departure. |
| 11 | **Does it comply with client requirements?** | **Review Required** | The platform has controls for audit logging, role-based access, and data retention. Whether it meets specific client contractual obligations (e.g., data residency, zero-trust, SOC 2, ISO 27001) requires a dedicated review against each client's requirements document. |

---

## 3. Summary of Gaps & Recommendations

| Priority | Gap | Recommendation |
|----------|-----|----------------|
| 🔴 High | Next.js middleware is temporarily disabled | Re-enable and harden middleware to enforce authentication on all protected routes before production use. |
| 🔴 High | No antivirus/malware scanning on uploaded files | Integrate a file scanning service (e.g., ClamAV, VirusTotal API) on the upload endpoint before storing files. |
| 🔴 High | No auto logout on session inactivity | Implement a client-side inactivity timer (e.g., 15–30 minutes) that triggers automatic sign-out. |
| 🟠 Medium | Former employee access not automated | Build or document an offboarding process that immediately sets user status to `rejected` upon termination. |
| 🟠 Medium | Archives (ZIP/RAR/7Z) are allowed in file uploads | Consider disallowing archive files if the business has no need for them, to reduce malware delivery risk. |
| 🟠 Medium | No IP allowlisting or device restriction | Evaluate VPN enforcement or IP-based access restrictions for sensitive roles (admin, compliance). |
| 🟠 Medium | Personal device access uncontrolled | Define and communicate an Acceptable Use Policy (AUP) for personal device usage. |
| 🟡 Low | Messages are not end-to-end encrypted | Evaluate need for E2EE depending on sensitivity of client data discussed in chats. |
| 🟡 Low | Supabase backup tier not confirmed | Confirm the Supabase plan includes point-in-time recovery and document the RTO/RPO. |
| 🟡 Low | External integrations (Jitsi, Giphy, LanguageTool) | Review data shared with these third-party services and ensure it aligns with privacy policies and client agreements. |

---

## 4. External Integrations Inventory

| Service | Purpose | Data Shared | Controlled? |
|---------|---------|-------------|-------------|
| Supabase | Database, Auth, File Storage | All app data | Yes — primary data store |
| Email (SMTP) | OTP delivery, password reset, account confirmation | User email, OTP codes | Yes |
| Giphy API | GIF search in chat | Search query strings | Partial — no user PII, but query terms sent externally |
| Jitsi Meet (`meet.ffmuc.net`) | In-app video calls | Room name, display name, audio/video stream | Partial — uses a public Jitsi server; consider self-hosting for confidentiality |
| LanguageTool API | Spell-check in chat | Message text snippets | Partial — message content sent to external API; evaluate privacy implications |

---

*This assessment reflects the current state of the codebase as of the assessment date. It should be reviewed and updated whenever significant changes are made to the system architecture, integrations, or security controls.*
