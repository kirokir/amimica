# Use a Node.js-focused image from Microsoft's official repository
FROM mcr.microsoft.com/devcontainers/javascript-node:18

# The USER_UID and USER_GID arguments are used to set the user and group ID
# of the 'node' user to match your local user, avoiding permission issues.
ARG USER_UID=1000
ARG USER_GID=$USER_UID
RUN if [ "$USER_GID" != "1000" ] || [ "$USER_UID" != "1000" ]; then \
    groupmod --gid $USER_GID node \
    && usermod --uid $USER_UID --gid $USER_GID node; \
    fi

# Switch to the non-root 'node' user
USER node

# Set the working directory inside the container
WORKDIR /workspaces/amimica
