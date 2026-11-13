#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <process.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>

/* Native stdio entry point for MCP clients; Electron supplies the Node runtime. */
int wmain(int argc,wchar_t **argv) {
 wchar_t folder[32768],engine[32768],entry[32768];
 DWORD size=GetModuleFileNameW(NULL,folder,32768);
 if(!size||size>=32768)return 1;
 wchar_t *slash=wcsrchr(folder,L'\\');if(!slash)return 1;*slash=L'\0';
 if(swprintf(engine,32768,L"%ls\\CreatorClub.exe",folder)<0)return 1;
 if(swprintf(entry,32768,L"%ls\\resources\\app\\server-dist\\mcp-entry.mjs",folder)<0)return 1;
 if(_putenv_s("ELECTRON_RUN_AS_NODE","1")!=0)return 1;
 const wchar_t **args=calloc((size_t)argc+2,sizeof(*args));if(!args)return 1;
 args[0]=engine;args[1]=entry;for(int i=1;i<argc;i++)args[i+1]=argv[i];
 intptr_t result=_wspawnv(_P_WAIT,engine,args);free(args);
 if(result==-1){perror("CreatorClub MCP could not start");return 1;}
 return (int)result;
}
