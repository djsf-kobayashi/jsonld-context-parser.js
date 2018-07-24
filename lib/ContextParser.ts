import 'isomorphic-fetch';
import {FetchDocumentLoader} from "./FetchDocumentLoader";
import {IDocumentLoader} from "./IDocumentLoader";
import {IJsonLdContextNormalized, IPrefixValue, JsonLdContext} from "./JsonLdContext";

/**
 * Flattens JSON-LD contexts
 */
export class ContextParser implements IDocumentLoader {

  private readonly documentLoader: IDocumentLoader;
  private readonly documentCache: {[url: string]: any};

  constructor(options?: IContextFlattenerOptions) {
    options = options || {};
    this.documentLoader = options.documentLoader || new FetchDocumentLoader();
    this.documentCache = {};
  }

  /**
   * Get the prefix from the given term.
   * @see https://json-ld.org/spec/latest/json-ld/#compact-iris
   * @param {string} term A term that is an URL or a prefixed URL.
   * @param {IJsonLdContextNormalized} context A context.
   * @return {string} The prefix or null.
   */
  public static getPrefix(term: string, context: IJsonLdContextNormalized): string {
    const separatorPos: number = term.indexOf(':');
    if (separatorPos >= 0) {
      // Suffix can not begin with two slashes
      if (term.length > separatorPos + 1
        && term.charAt(separatorPos + 1) === '/'
        && term.charAt(separatorPos + 2) === '/') {
        return null;
      }

      const prefix: string = term.substr(0, separatorPos);

      // Prefix can not be an underscore (this is a blank node)
      if (prefix === '_') {
        return null;
      }

      // Prefix must match a term in the active context
      if (context[prefix]) {
        return prefix;
      }
    }
    return null;
  }

  /**
   * Expand the prefix of the given term if it has one,
   * otherwise return the term as-is.
   * @param {string} term A term that is an URL or a prefixed URL.
   * @param {IJsonLdContextNormalized} context A context.
   * @return {string} The expanded term or the term as-is.
   */
  public static expandPrefixedTerm(term: string, context: IJsonLdContextNormalized): string {
    const prefix: string = ContextParser.getPrefix(term, context);
    if (prefix) {
      return context[prefix] + term.substr(prefix.length + 1);
    }
    return term;
  }

  /**
   * Check if the given context value can be a prefix value.
   * @param value A context value.
   * @return {boolean} If it can be a prefix value.
   */
  public static isPrefixValue(value: any): boolean {
    return value && (typeof value === 'string' || value['@id'] || value['@type']);
  }

  /**
   * Expand all prefixed terms in the given context/
   * @param {IJsonLdContextNormalized} context A context.
   * @return {IJsonLdContextNormalized} A copy of the input context where all prefixes are expanded.
   */
  public static expandPrefixedTerms(context: IJsonLdContextNormalized): IJsonLdContextNormalized {
    context = { ... context };

    for (const key of Object.keys(context)) {
      // Loop because prefixes might be nested
      while (ContextParser.isPrefixValue(context[key])) {
        const value: IPrefixValue = context[key];
        if (typeof value === 'string') {
          context[key] = ContextParser.expandPrefixedTerm(value, context);
          if (value === context[key]) {
            break;
          }
        } else {
          const id = value['@id'];
          const type = value['@type'];
          if (id) {
            context[key]['@id'] = ContextParser.expandPrefixedTerm(id, context);
            if (id === context[key]['@id']) {
              break;
            }
          }
          if (type) {
            context[key]['@type'] = ContextParser.expandPrefixedTerm(type, context);
            if (type === context[key]['@type']) {
              break;
            }
          }
        }
      }
    }

    return context;
  }

  public async parse(context: JsonLdContext,
                     parentContext?: IJsonLdContextNormalized): Promise<IJsonLdContextNormalized> {
    if (typeof context === 'string') {
      return this.parse(await this.load(context), parentContext);
    } else if (Array.isArray(context)) {
      return context.reduce((accContextPromise, contextEntry) => accContextPromise
        .then((accContext) => this.parse(contextEntry, accContext)), Promise.resolve({}));
    } else {
      // We have an actual context object.
      context = { ...parentContext, ...context };
      context = ContextParser.expandPrefixedTerms(context);
      return context;
    }
  }

  public async load(url: string): Promise<IJsonLdContextNormalized> {
    if (this.documentCache[url]) {
      return {... this.documentCache[url]};
    }
    return this.documentCache[url] = await this.parse(await this.documentLoader.load(url));
  }

}

export interface IContextFlattenerOptions {
  documentLoader?: IDocumentLoader;
}
