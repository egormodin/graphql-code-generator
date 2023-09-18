import { oldVisit, PluginFunction, Types } from '@graphql-codegen/plugin-helpers';
import { LoadedFragment, optimizeOperations } from '@graphql-codegen/visitor-plugin-common';
import { concatAST, FragmentDefinitionNode, GraphQLSchema, Kind } from 'graphql';
import { TypeScriptDocumentsPluginConfig } from './config.js';
import { TypeScriptDocumentsVisitor } from './visitor.js';
import { buildObjectTree, capitalize, convertToType } from './utils.js';

export { TypeScriptDocumentsPluginConfig } from './config.js';

export const plugin: PluginFunction<TypeScriptDocumentsPluginConfig, Types.ComplexPluginOutput> = (
  schema: GraphQLSchema,
  rawDocuments: Types.DocumentFile[],
  config: TypeScriptDocumentsPluginConfig
) => {
  const documents = config.flattenGeneratedTypes
    ? optimizeOperations(schema, rawDocuments, {
        includeFragments: config.flattenGeneratedTypesIncludeFragments,
      })
    : rawDocuments;
  const allAst = concatAST(documents.map(v => v.document));

  const allFragments: LoadedFragment[] = [
    ...(allAst.definitions.filter(d => d.kind === Kind.FRAGMENT_DEFINITION) as FragmentDefinitionNode[]).map(
      fragmentDef => ({
        node: fragmentDef,
        name: fragmentDef.name.value,
        onType: fragmentDef.typeCondition.name.value,
        isExternal: false,
      })
    ),
    ...(config.externalFragments || []),
  ];

  const visitor = new TypeScriptDocumentsVisitor(schema, config, allFragments);

  const visitorResult = oldVisit(allAst, {
    leave: visitor,
  });

  let content = visitorResult.definitions.join('\n');

  if (config.addOperationExport) {
    const exportConsts = [];

    for (const d of allAst.definitions) {
      if ('name' in d) {
        exportConsts.push(`export declare const ${d.name.value}: import("graphql").DocumentNode;`);
      }
    }

    content = visitorResult.definitions
      .concat(exportConsts)
      .map(definition => {
        const [variables, query] = definition.split('\n\n');
        const [, start, queryName, name, value, end] = query.match(
          /(.*export type (\w+Query) = [^<]+) (\w+): Array<(.+)>([^>]*)/m
        );
        const typeName = queryName + capitalize(name);
        const newValue = convertToType(buildObjectTree(value));

        return (
          `${variables}\n\n` +
          `export type ${typeName} = ${newValue};\n\n` +
          `${start}readonly ${name}: Array<${typeName}>${end}\n`
        );
      })
      .join('\n');
  }

  if (config.globalNamespace) {
    content = `
    declare global {
      ${content}
    }`;
  }

  return {
    prepend: [...visitor.getImports(), ...visitor.getGlobalDeclarations(visitor.config.noExport)],
    content,
  };
};

export { TypeScriptDocumentsVisitor };
