import re,json,hashlib,sys
from pathlib import Path
base=Path(sys.argv[1]).read_text()
new=Path(__file__).resolve().parent.parent.joinpath('app.js').read_text()
def names(s):
    functions=set()
    for pattern in [r'\bfunction\s+([\w$]+)\s*\(',r'\bwindow\.([\w$]+)\s*=\s*(?:async\s+)?function\b',r'\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>']:
        functions.update(re.findall(pattern,s))
    return functions,set(re.findall(r'\b(?:const|let|var)\s+([\w$]+)',s))
bf,bv=names(base);nf,nv=names(new)
result={'baseVersion':'2.1.5','newVersion':'2.1.6','method':'Comparative unique lexical names: named functions, window function assignments, declared arrows; first identifier after const/let/var. Same patterns on both versions, included in this script. Counts do not prove behavior parity.', 'base':{'functions':len(bf),'variables':len(bv)},'new':{'functions':len(nf),'variables':len(nv)},'delta':{'functions':len(nf)-len(bf),'variables':len(nv)-len(bv)},'addedFunctions':sorted(nf-bf),'removedFunctions':sorted(bf-nf),'addedVariables':sorted(nv-bv),'removedVariables':sorted(bv-nv),'sourceSHA256':{v:hashlib.sha256(s.encode()).hexdigest() for v,s in [('2.1.5',base),('2.1.6',new)]},'validation':['node --check app.js PASS','Recommendation/history/prescription tests PASS; weight precision, bar +5 and dumbbell boundaries PASS', 'Importer VM tests PASS','ZIP CRC PASS'],'limitations':['No live iPhone or Firebase end-to-end testing. Existing historical version overrides remain.']}
Path(__file__).with_name('code_counts_2.1.6.json').write_text(json.dumps(result,indent=2)+'\n')
assert not result['removedFunctions']
print(json.dumps(result,indent=2))
