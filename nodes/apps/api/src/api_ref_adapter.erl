%% -*- mode: erlang -*-
%% -*- erlang-indent-level: 4;indent-tabs-mode: nil -*-
%% ex: ts=4 sw=4 et
%% Copyright 2011 Benjamin Nortier
%%
%%   Licensed under the Apache License, Version 2.0 (the "License");
%%   you may not use this file except in compliance with the License.
%%   You may obtain a copy of the License at
%%
%%       http://www.apache.org/licenses/LICENSE-2.0
%%
%%   Unless required by applicable law or agreed to in writing, software
%%   distributed under the License is distributed on an "AS IS" BASIS,
%%   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
%%   See the License for the specific language governing permissions and
%%   limitations under the License.

-module(api_ref_adapter).
-author('Benjamin Nortier <bjnortier@gmail.com>').
-export([methods/1, validate/4, update/4, get/3]).
-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").
-endif.

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%                                 public                                   %%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% 

methods(_ReqData) ->
    ['GET', 'PUT'].

validate(ReqData, User, Design, NewCommitRef) ->
    RefType = wrq:path_info(reftype, ReqData),
    Ref = wrq:path_info(ref, ReqData),
    validate(User, Design, RefType, Ref, NewCommitRef).

validate(_User, _Design, "heads", "master", NewCommitRef) when is_binary(NewCommitRef) ->
    ok;
validate(_User, _Design, _RefType, _Ref, NewCommitRef) when is_binary(NewCommitRef) ->
    {error, <<"only \"heads\" and \"master\" supported">>};
validate(_User, _Design, _RefType, _Ref, _NewCommitRef) ->
    {error, <<"string commit SHA expected">>}.


get(ReqData, User, Design) ->
    RefType = wrq:path_info(reftype, ReqData),
    Ref = wrq:path_info(ref, ReqData),
    {RootProps} = api_db:get_root(User, Design),
    {Refs} =  case lists:keyfind(<<"refs">>, 1, RootProps) of
		  {_, R} -> R;
		  false -> {[]}
	      end,
    {Commits} = case lists:keyfind(list_to_binary(RefType), 1, Refs) of
		  {_, Cs} -> Cs;
		  false -> {[]}
	      end,
    case lists:keyfind(list_to_binary(Ref), 1, Commits) of
	false -> undefined;
	{_, Commit} -> Commit
    end.

update(ReqData, User, Design, NewCommitRef) when is_binary(NewCommitRef) ->
    RefType = wrq:path_info(reftype, ReqData),
    Ref = wrq:path_info(ref, ReqData),
    Root = api_db:get_root(User, Design),
    {RootProps} = Root,
    {Refs} =  case lists:keyfind(<<"refs">>, 1, RootProps) of
		  {_, R} -> R;
		  false -> {[]}
	      end,
    {Commits} = case lists:keyfind(list_to_binary(RefType), 1, Refs) of
		  {_, C} -> C;
		  false -> {[]}
	      end,
    NewCommits = lists:keyreplace(list_to_binary(Ref), 1, Commits, {list_to_binary(Ref), NewCommitRef}),
    NewRefs = lists:keyreplace(list_to_binary(RefType), 1, Refs, {list_to_binary(RefType), {NewCommits}}),
    NewRootProps = lists:keyreplace(<<"refs">>, 1, RootProps, {<<"refs">>, {NewRefs}}),
    ok = api_db:put_root(User, Design, {NewRootProps}),
io:format("Updated ~s/~s ~s/~s: ~p", [User, Design, RefType, RefType, jiffy:encode({NewRootProps})]),
    {ok, <<"updated">>}.


-ifdef(TEST).

get_test_() ->
    {setup, 
     fun() -> 
	     meck:new(wrq),
	     meck:expect(wrq, path_info,
	     		 fun(reftype, {}) ->
	     			 "heads";
	     		    (ref, {}) ->
	     			 "master"
	     		 end),
	     meck:new(api_db),
	     meck:expect(api_db, get_root, 
			 fun("bjnortier", "iphonedock") -> 
				 {[{<<"refs">>, 
				    {[{<<"heads">>,
				       {[{<<"master">>, <<"009c">>}]} 
				      }]} 
				   }]}
			 end)
     end, 
     fun(_) -> 
	     meck:unload(api_db),
	     meck:unload(wrq)
     end,
     [
      ?_assertEqual(<<"009c">>, get({}, "bjnortier", "iphonedock")),
      ?_assert(meck:validate(api_db)),
      ?_assert(meck:validate(wrq))
     ]
    }.

update_test_() ->
    {setup, 
     fun() -> 
	     meck:new(wrq),
	     meck:new(api_db),

	     meck:expect(wrq, path_info,
	     		 fun(reftype, {}) ->
	     			 "heads";
	     		    (ref, {}) ->
	     			 "master"
	     		 end),

	     meck:expect(api_db, get_root, 
			 fun("bjnortier", "iphonedock") -> 
				 {[{<<"refs">>, 
				    {[{<<"heads">>,
				       {[{<<"master">>, <<"009c">>}]} 
				      }]} 
				   }]}
			 end),
	     meck:expect(api_db, put_root, 
			 fun("bjnortier", "iphonedock", 
			     {[{<<"refs">>, 
				{[{<<"heads">>,
				   {[{<<"master">>, <<"af56">>}]} 
				  }]} 
			       }]}) ->
				 ok
			 end)

     end, 
     fun(_) -> 
	     meck:unload(wrq),
	     meck:unload(api_db)

     end,
     [
      ?_assertEqual({ok,<<"updated">>}, update({}, "bjnortier", "iphonedock", <<"af56">>)),
      ?_assert(meck:validate(api_db)),
      ?_assert(meck:validate(wrq))
     ]
    }.


-endif.
