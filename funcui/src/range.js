export class DOMRange {
  constructor(parent, label) {
    this.start = parent.ownerDocument.createComment(`${label}:start`);
    this.end = parent.ownerDocument.createComment(`${label}:end`);

    parent.append(this.start, this.end);
  }

  get ownerDocument() {
    return this.start.ownerDocument;
  }

  contains(node) {
    for (
      let current = this.start.nextSibling;
      current && current !== this.end;
      current = current.nextSibling
    ) {
      if (current === node) {
        return true;
      }
    }

    return false;
  }

  clear() {
    while (this.start.nextSibling && this.start.nextSibling !== this.end) {
      this.start.nextSibling.remove();
    }
  }

  replaceChildren(content) {
    this.clear();

    this.end.parentNode.insertBefore(content, this.end);
  }

  moveBefore(anchor) {
    if (this.end.nextSibling === anchor) {
      return;
    }

    const parent = anchor.parentNode;
    const fragment = this.ownerDocument.createDocumentFragment();
    let current = this.start;

    while (current) {
      const next = current.nextSibling;
      fragment.appendChild(current);

      if (current === this.end) {
        break;
      }

      current = next;
    }

    parent.insertBefore(fragment, anchor);
  }

  remove() {
    this.clear();
    this.start.remove();
    this.end.remove();
  }
}
