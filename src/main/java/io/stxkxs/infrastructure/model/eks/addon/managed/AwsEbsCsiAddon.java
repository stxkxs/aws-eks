package io.stxkxs.infrastructure.model.eks.addon.managed;

import io.stxkxs.infrastructure.model.kms.Kms;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@AllArgsConstructor
@NoArgsConstructor
public class AwsEbsCsiAddon extends ManagedAddon {
  private Kms kms;
  private String defaultStorageClass;
}