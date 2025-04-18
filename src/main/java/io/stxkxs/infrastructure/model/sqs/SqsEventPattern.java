package io.stxkxs.infrastructure.model.sqs;

import java.util.List;

public record SqsEventPattern(
  List<String> source,
  List<String> detailType
) {}
