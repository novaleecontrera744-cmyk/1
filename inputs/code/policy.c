#include "policy.h"

/* TODO: implement the assignment's policy. Do not change the signatures. */
bool authorize_read(bool granted)
{
    return granted;
}

bool authorize_clone(uid_t caller, uid_t owner, bool granted)
{
    return caller == owner && granted;
}

bool authorize_run(uid_t executor, uid_t requester, bool executor_granted, bool requester_granted)
{
    (void)executor; (void)requester;
    (void)executor_granted;
    return requester_granted;
}

bool authorize_fetch(uid_t caller, uid_t owner)
{
    return caller == owner;
}

uid_t archive_owner(uid_t executor, uid_t requester)
{
    (void)executor; (void)requester;
    return requester;
}
