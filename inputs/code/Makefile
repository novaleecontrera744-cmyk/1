CC ?= cc
CFLAGS ?= -O2 -std=c11 -Wall -Wextra -Werror -fstack-protector-strong -D_FORTIFY_SOURCE=2
LDFLAGS ?= -Wl,-z,relro,-z,now

.PHONY: all clean
all: export-helper
export-helper: engine.c policy.c credentials.c policy.h credentials.h
	$(CC) $(CFLAGS) engine.c policy.c credentials.c $(LDFLAGS) -o $@
clean:
	rm -f export-helper
