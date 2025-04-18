package io.stxkxs.infrastructure.model.s3;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/**
 * this is a representation of an iam policy with some tricks in regards to the principals.
 * the structure should probable remaing the same because it is easier to copy, manipulate, and parse
 * existing policies (ie. karpenter) than it is to convert them all to yaml.
 * this is bad gnarly though.
 * <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_examples.html">...</a>
 *
 * @param effect
 * @param actions
 * @param resources
 * @param conditions
 */

public record BucketPolicyStatementConf(
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
