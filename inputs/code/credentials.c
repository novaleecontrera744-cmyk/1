#define _GNU_SOURCE
#include <errno.h>
#include <unistd.h>
#include "credentials.h"

/* TODO: use real Linux credentials; do not emulate transitions. */
uid_t requester_uid(void)
{
    return getuid();
}

int temporary_drop(uid_t caller)
{
    return setresuid((uid_t)-1, caller, (uid_t)-1);
}

int restore_service(uid_t service)
{
    return setresuid((uid_t)-1, service, (uid_t)-1);
}

int permanent_drop(uid_t caller)
{
    return setresuid(caller, caller, caller);
}
