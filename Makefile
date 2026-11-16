PREFIX ?= /usr/local
DESTDIR ?=
SUDO ?= sudo
PACKAGE_DIR := $(if $(wildcard kixt),.,dist)
BINDIR ?= $(PREFIX)/bin
LIBDIR ?= $(PREFIX)/lib/kix
DOCDIR ?= $(PREFIX)/share/doc/kix
LICENSEDIR ?= $(PREFIX)/share/licenses/kix

ifeq ($(strip $(DESTDIR)),)
INSTALL_AS = $(SUDO)
else
INSTALL_AS =
endif

.PHONY: help install uninstall

help:
	@printf '%s\n' \
		'Kix installer:' \
		'  make install    install kixt, modules, docs, and license' \
		'  make uninstall  remove installed files' \
		'' \
		'Variables:' \
		'  PREFIX=$(PREFIX)' \
		'  DESTDIR=$(DESTDIR)' \
		'  SUDO=$(SUDO)' \
		'' \
		'When DESTDIR is empty, install/uninstall run through sudo and may prompt for a password.'

install:
	$(INSTALL_AS) ./scripts/install.sh "$(PACKAGE_DIR)" "$(DESTDIR)$(BINDIR)" "$(DESTDIR)$(LIBDIR)" "$(DESTDIR)$(DOCDIR)" "$(DESTDIR)$(LICENSEDIR)" "$(CURDIR)"

uninstall:
	$(INSTALL_AS) rm -rf "$(DESTDIR)$(BINDIR)/kixt" "$(DESTDIR)$(LIBDIR)" "$(DESTDIR)$(DOCDIR)" "$(DESTDIR)$(LICENSEDIR)"
	@printf 'Removed installed Kix files under %s\n' "$(DESTDIR)$(PREFIX)"
