#ifndef HW01_POLICY_H
#define HW01_POLICY_H
#include <stdbool.h>
#include <sys/types.h>
bool authorize_read(bool granted);
bool authorize_clone(uid_t caller, uid_t owner, bool granted);
bool authorize_run(uid_t executor, uid_t requester, bool executor_granted, bool requester_granted);
bool authorize_fetch(uid_t caller, uid_t owner);
uid_t archive_owner(uid_t executor, uid_t requester);
#endif
