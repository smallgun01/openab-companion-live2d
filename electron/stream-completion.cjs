function reconcileStreamCompletion({ receivedDelta, receivedDone, fullText }) {
  return {
    fallbackText: !receivedDelta && typeof fullText === 'string' && fullText ? fullText : null,
    shouldComplete: !receivedDone,
  };
}

module.exports = { reconcileStreamCompletion };
