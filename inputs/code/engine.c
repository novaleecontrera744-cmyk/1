#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>
#include "policy.h"
#include "credentials.h"

/* Fixed engine: administrative fixture files are never supplied by callers. */
#ifndef LAB_ROOT
#define LAB_ROOT "/var/lib/hw01"
#endif
#define MAX_CONTENT 4096
#define MAX_NAME 32
struct user { char name[MAX_NAME + 1]; uid_t uid; };
static struct user users[4];
static uid_t caller, service_uid;
static const char *actor;

static void fail(const char *message)
{
    fprintf(stderr, "ENVIRONMENT_OR_IMPLEMENTATION_ERROR: %s (errno=%d)\n", message, errno);
    exit(2);
}
static bool label(const char *s)
{
    size_t n = strlen(s);
    if (!n || n > MAX_NAME) return false;
    for (size_t i = 0; i < n; i++)
        if (!((s[i] >= 'A' && s[i] <= 'Z') || (s[i] >= 'a' && s[i] <= 'z') ||
              (s[i] >= '0' && s[i] <= '9') || s[i] == '-' || s[i] == '_')) return false;
    return true;
}
static void path(char *out, size_t cap, const char *kind, const char *name)
{
    if (!label(name)) fail("invalid label");
    int n = snprintf(out, cap, "%s/%s/%s", LAB_ROOT, kind, name);
    if (n < 0 || (size_t)n >= cap) fail("path too long");
}
static FILE *open_fixed(const char *kind, const char *name, bool writing)
{
    char filename[PATH_MAX];
    path(filename, sizeof(filename), kind, name);
    int flags = (writing ? O_WRONLY | O_CREAT | O_TRUNC : O_RDONLY) | O_NOFOLLOW | O_CLOEXEC;
    int fd = open(filename, flags, 0600);
    if (fd < 0) fail("open fixture file");
    struct stat st;
    if (fstat(fd, &st) < 0 || !S_ISREG(st.st_mode) || st.st_uid != service_uid || (st.st_mode & 077) != 0)
        fail("unsafe fixture file");
    FILE *f = fdopen(fd, writing ? "w" : "r");
    if (!f) fail("fdopen");
    return f;
}
static void close_fixed(FILE *f)
{
    if (fclose(f) != 0) fail("close fixture file");
}
static size_t read_content(const char *kind, const char *name, char out[MAX_CONTENT + 1])
{
    FILE *f = open_fixed(kind, name, false);
    size_t n = fread(out, 1, MAX_CONTENT + 1, f);
    if (ferror(f) || n > MAX_CONTENT) fail("invalid content");
    out[n] = '\0';
    close_fixed(f);
    return n;
}
static void write_text(const char *kind, const char *name, const char *text)
{
    FILE *f = open_fixed(kind, name, true);
    if (fputs(text, f) == EOF) fail("write fixture file");
    close_fixed(f);
}
static void json_bytes(const char *s, size_t n)
{
    putchar('"');
    for (size_t i = 0; i < n; i++) {
        unsigned char c = (unsigned char)s[i];
        if (c == '"' || c == '\\') { putchar('\\'); putchar(c); }
        else if (c < 32) printf("\\u%04x", c);
        else putchar(c);
    }
    putchar('"');
}
static void ids(uid_t out[3])
{
    if (getresuid(&out[0], &out[1], &out[2]) < 0) fail("getresuid");
}
static void permanent_checked(void)
{
    if (permanent_drop(caller) != 0) fail("permanent_drop failed");
    uid_t now[3]; ids(now);
    if (now[0] != caller || now[1] != caller || now[2] != caller) fail("incomplete permanent drop");
}
static void respond_bytes(bool allowed, const char *value, size_t n)
{
    /* All internal streams have already been closed before permanent drop. */
    permanent_checked();
    if (!allowed) { puts("{\"decision\":\"deny\"}"); return; }
    printf("{\"decision\":\"allow\",\"value\":");
    json_bytes(value, n);
    puts("}");
}
static void respond(bool allowed, const char *value)
{
    respond_bytes(allowed, value, strlen(value));
}
static void write_bytes(const char *kind, const char *name, const char *data, size_t n)
{
    FILE *f = open_fixed(kind, name, true);
    if (fwrite(data, 1, n, f) != n) fail("write content");
    close_fixed(f);
}
static void load_users(void)
{
    FILE *f = open_fixed("meta", "users", false);
    for (int i = 0; i < 4; i++) {
        unsigned long uid;
        if (fscanf(f, "%32s %lu", users[i].name, &uid) != 2 || !label(users[i].name) ||
            uid == 0 || uid == service_uid || uid > UINT_MAX) fail("invalid user map");
        users[i].uid = (uid_t)uid;
        for (int j = 0; j < i; j++)
            if (users[i].uid == users[j].uid || !strcmp(users[i].name, users[j].name)) fail("duplicate user");
        if (users[i].uid == caller) actor = users[i].name;
    }
    close_fixed(f);
    if (!actor) fail("caller not in fixture");
}
static uid_t user_uid(const char *name)
{
    for (int i = 0; i < 4; i++) if (!strcmp(name, users[i].name)) return users[i].uid;
    fail("unknown actor"); return (uid_t)-1;
}
static const char *uid_name(uid_t uid)
{
    for (int i = 0; i < 4; i++) if (uid == users[i].uid) return users[i].name;
    fail("policy returned unknown archive owner"); return NULL;
}
static void dataset_exists(const char *dataset)
{
    FILE *f = open_fixed("data", dataset, false); close_fixed(f);
}
static bool granted(const char *name, const char *dataset)
{
    FILE *f = open_fixed("meta", "grants", false);
    char who[MAX_NAME + 1], target[MAX_NAME + 1]; bool result = false;
    while (fscanf(f, "%32s %32s", who, target) == 2)
        if (!strcmp(who, name) && !strcmp(target, dataset)) result = true;
    close_fixed(f); return result;
}
static void new_id(const char *kind, const char *prefix, char out[MAX_NAME + 1])
{
    for (unsigned long number = 1; number < 10000000; number++) {
        int n = snprintf(out, MAX_NAME + 1, "%s-%lu", prefix, number);
        if (n < 0 || n > MAX_NAME) fail("ID overflow");
        char filename[PATH_MAX]; path(filename, sizeof(filename), kind, out);
        int fd = open(filename, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
        if (fd >= 0) { if (close(fd)) fail("close ID file"); return; }
        if (errno != EEXIST) fail("allocate ID");
    }
    fail("ID space exhausted");
}
static void job(const char *id, char who[MAX_NAME + 1], char dataset[MAX_NAME + 1])
{
    FILE *f = open_fixed("jobs", id, false);
    if (fscanf(f, "%32s %32s", who, dataset) != 2) fail("invalid job");
    close_fixed(f); (void)user_uid(who); dataset_exists(dataset);
}
static void create_job(const char *who, const char *dataset, char out[MAX_NAME + 1])
{
    new_id("jobs", "request", out);
    char metadata[2 * MAX_NAME + 4];
    snprintf(metadata, sizeof(metadata), "%s %s\n", who, dataset);
    write_text("jobs", out, metadata);
}
static bool completed(const char *id, char archive[MAX_NAME + 1])
{
    char filename[PATH_MAX]; path(filename, sizeof(filename), "completed", id);
    if (faccessat(AT_FDCWD, filename, F_OK, AT_EACCESS) != 0) {
        if (errno == ENOENT) return false;
        fail("check completion");
    }
    FILE *f = open_fixed("completed", id, false);
    if (fscanf(f, "%32s", archive) != 1 || !label(archive)) fail("invalid completion");
    close_fixed(f); return true;
}
static void append_record(const char *name, const char *text)
{
    char filename[PATH_MAX]; path(filename, sizeof(filename), "meta", name);
    int fd = open(filename, O_WRONLY | O_APPEND | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0) fail("open append log");
    struct stat st;
    if (fstat(fd, &st) < 0 || !S_ISREG(st.st_mode) || st.st_uid != service_uid || (st.st_mode & 077))
        fail("unsafe log");
    FILE *f = fdopen(fd, "a"); if (!f) fail("log fdopen");
    if (fputs(text, f) == EOF) fail("append log");
    close_fixed(f);
}
static void audit(const char *id, const char *who, const char *dataset, bool allow)
{
    char line[3 * MAX_NAME + 16];
    snprintf(line, sizeof(line), "%s %s %s %s\n", id, who, dataset, allow ? "allow" : "deny");
    append_record("audit", line);
}
static void probe(void)
{
    char filename[PATH_MAX]; path(filename, sizeof(filename), "meta", "probe_data");
    int fd = open(filename, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0) fail("probe initial open");
    uid_t initial[3], temporary[3], restored[3], final[3];
    ids(initial);
    if (temporary_drop(caller) != 0) fail("temporary_drop failed");
    ids(temporary);
    if (temporary[0] != caller || temporary[1] != caller || temporary[2] != service_uid)
        fail("incorrect temporary credentials");
    if (restore_service(service_uid) != 0) fail("restore_service failed");
    ids(restored);
    if (restored[0] != caller || restored[1] != service_uid || restored[2] != service_uid)
        fail("incorrect restored credentials");
    permanent_checked(); ids(final);
    errno = 0;
    int restoration = restore_service(service_uid); int restore_errno = errno;
    if (restoration != -1 || restore_errno != EPERM) fail("privilege could be regained");
    errno = 0;
    int reopened = open(filename, O_RDONLY | O_NOFOLLOW | O_CLOEXEC); int open_errno = errno;
    if (reopened >= 0) { close(reopened); fail("unprivileged reopen succeeded"); }
    if (open_errno != EACCES) fail("unprivileged reopen failed for unexpected reason");
    char contents[MAX_CONTENT + 1]; ssize_t n = read(fd, contents, MAX_CONTENT);
    if (n < 0) fail("held descriptor unreadable");
    contents[n] = '\0'; if (close(fd)) fail("probe close");
    printf("{\"initial\":[%u,%u,%u],\"temporary\":[%u,%u,%u],\"restored\":[%u,%u,%u],\"permanent\":[%u,%u,%u],\"restore_errno\":%d,\"reopen_errno\":%d,\"held_content\":",
           initial[0],initial[1],initial[2],temporary[0],temporary[1],temporary[2],
           restored[0],restored[1],restored[2],final[0],final[1],final[2],restore_errno,open_errno);
    json_bytes(contents, (size_t)n); puts("}");
}
int main(int argc, char **argv)
{
    umask(077);
    caller = getuid(); service_uid = geteuid();
    uid_t initial[3]; ids(initial);
    if (service_uid == 0 || caller == service_uid || initial[2] != service_uid || prctl(PR_GET_NO_NEW_PRIVS,0,0,0,0) != 0)
        fail("setuid inactive or wrong execution environment");
    if (requester_uid() != caller) fail("requester_uid must match real UID");
    load_users();
    if (argc != 3 || !label(argv[2])) fail("usage: export-helper OP LABEL");
    const char *op = argv[1], *target = argv[2];
    char content[MAX_CONTENT + 1], id[MAX_NAME + 1];
    if (!strcmp(op, "probe")) {
        if (strcmp(target, "probe_data")) fail("probe uses only its diagnostic file");
        probe(); return 0;
    }
    if (!strcmp(op, "read_dataset") || !strcmp(op, "enqueue")) {
        dataset_exists(target);
        if (!authorize_read(granted(actor,target))) { respond(false,""); return 0; }
        if (!strcmp(op,"read_dataset")) { size_t n = read_content("data",target,content); respond_bytes(true,content,n); }
        else { create_job(actor,target,id); respond(true,id); }
    } else if (!strcmp(op,"clone_job")) {
        char who[MAX_NAME+1], dataset[MAX_NAME+1]; job(target,who,dataset);
        if (!authorize_clone(caller,user_uid(who),granted(actor,dataset))) { respond(false,""); return 0; }
        create_job(actor,dataset,id); respond(true,id);
    } else if (!strcmp(op,"run_worker")) {
        char who[MAX_NAME+1], dataset[MAX_NAME+1]; job(target,who,dataset);
        if (completed(target,id)) { respond(true,id); return 0; }
        if (!authorize_run(caller,user_uid(who),granted(actor,dataset),granted(who,dataset))) {
            audit(target,who,dataset,false); respond(false,""); return 0;
        }
        size_t content_size = read_content("data",dataset,content);
        char line[MAX_NAME+2]; snprintf(line,sizeof(line),"%s\n",dataset); append_record("reads",line);
        new_id("archives","bundle",id); write_bytes("archives",id,content,content_size);
        char metadata[2*MAX_NAME+4];
        snprintf(metadata,sizeof(metadata),"%s %s\n",uid_name(archive_owner(caller,user_uid(who))),dataset);
        write_text("owners",id,metadata);
        write_text("completed",target,id); audit(target,who,dataset,true); respond(true,id);
    } else if (!strcmp(op,"fetch_archive")) {
        char who[MAX_NAME+1], dataset[MAX_NAME+1]; FILE *f = open_fixed("owners",target,false);
        if (fscanf(f,"%32s %32s",who,dataset) != 2) fail("invalid archive metadata");
        close_fixed(f);
        if (!authorize_fetch(caller,user_uid(who))) { respond(false,""); return 0; }
        size_t n = read_content("archives",target,content); respond_bytes(true,content,n);
    } else fail("unknown operation");
    return 0;
}
