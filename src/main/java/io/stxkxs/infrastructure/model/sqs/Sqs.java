package io.stxkxs.infrastructure.model.sqs;

import io.stxkxs.infrastructure.model.iam.PolicyConf;

import java.util.List;
import java.util.Map;

public record Sqs(
  String name,
  int retention,
  List<SqsRule> rules,
  List<PolicyConf> customPolicies,
  Map<String, String> tags
) {}
