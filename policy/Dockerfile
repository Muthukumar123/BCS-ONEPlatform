# Pin this image to an approved digest before production rollout.
FROM openpolicyagent/opa:1.8.0-static
COPY policy/rego /policy
EXPOSE 8181
ENTRYPOINT ["/opa"]
CMD ["run", "--server", "--addr=0.0.0.0:8181", "/policy"]
