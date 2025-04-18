package io.stxkxs.infrastructure.serialization;

import com.fasterxml.jackson.annotation.JsonInclude.Include;
import com.fasterxml.jackson.annotation.JsonSetter.Value;
import com.fasterxml.jackson.annotation.Nulls;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.introspect.DefaultAccessorNamingStrategy.Provider;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.fasterxml.jackson.datatype.jdk8.Jdk8Module;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

import static com.fasterxml.jackson.dataformat.yaml.YAMLGenerator.Feature.WRITE_DOC_START_MARKER;

public class Mapper {
  private static final ObjectMapper mapper = configure();

  private Mapper() {}

  private static ObjectMapper configure() {

    return JsonMapper
      .builder(yamlConf())
      .enable(MapperFeature.ACCEPT_CASE_INSENSITIVE_ENUMS)
      .enable(MapperFeature.ACCEPT_CASE_INSENSITIVE_PROPERTIES)
      .serializationInclusion(Include.NON_NULL)
      .addMixIn(Object.class, DefaultMixin.class)
      .addModule(new Jdk8Module())
      .withConfigOverride(LinkedHashMap.class, (handler) -> handler.setSetterInfo(Value.forValueNulls(Nulls.AS_EMPTY)))
      .withConfigOverride(TreeSet.class, (handler) -> handler.setSetterInfo(Value.forValueNulls(Nulls.AS_EMPTY)))
      .withConfigOverride(Map.class, (handler) -> handler.setSetterInfo(Value.forValueNulls(Nulls.AS_EMPTY)))
      .withConfigOverride(List.class, (handler) -> handler.setSetterInfo(Value.forValueNulls(Nulls.AS_EMPTY)))
      .accessorNaming(
        new Provider()
          .withIsGetterPrefix("")
          .withGetterPrefix("")
          .withSetterPrefix(""))
      .build();
  }

  private static YAMLFactory yamlConf() {
    return YAMLFactory.builder()
      .disable(WRITE_DOC_START_MARKER)
      .build();
  }

  public static ObjectMapper get() {return mapper;}
}
