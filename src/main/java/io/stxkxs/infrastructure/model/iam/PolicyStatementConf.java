package io.stxkxs.infrastructure.model.iam;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

public record PolicyStatementConf(
  @JsonProperty("Sid")
  String sid,
  @JsonProperty("Effect")
  String effect,
  @JsonProperty("Action")
  List<String> actions,
  @JsonProperty("Resource")
  List<String> resources,
  @JsonProperty("Condition")
  Map<String, Object> conditions
) {}
