#ifndef HW01_CREDENTIALS_H
#define HW01_CREDENTIALS_H
#include <sys/types.h>
uid_t requester_uid(void);
int temporary_drop(uid_t caller);
int restore_service(uid_t service);
int permanent_drop(uid_t caller);
#endif
