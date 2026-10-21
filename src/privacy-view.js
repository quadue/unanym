import {memberPage} from './presentation.js';
import {renderMarkdown} from './markdown.js';
import {documentLayout} from './docs-layout.js';

// Supplied by this installation's operator, not inferred from the product name.
export function privacyView(config) {
  return memberPage(config,'Privacy',documentLayout(renderMarkdown(config.privacyNotice)),{access:true});
}
