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

-module(node_signup_email_resource).
-author('Benjamin Nortier <bjnortier@gmail.com>').
-export([
	 init/1, 
         allowed_methods/2,
	 content_types_provided/2,
	 resource_exists/2,
	 provide_content/2,
	 content_types_accepted/2,
	 post_is_create/2,
	 create_path/2,
	 accept_content/2,
	 malformed_request/2
        ]).
-include_lib("webmachine/include/webmachine.hrl").
-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").
-endif.

-record(context, {method, email_address}).

init([]) -> 
    {ok, #context{}}.

allowed_methods(ReqData, Context) -> 
    Context1 = Context#context{ method=wrq:method(ReqData) },
    {['GET', 'POST'], ReqData, Context1}.

content_types_provided(ReqData, Context) ->
    {[{"text/html", provide_content}], ReqData, Context}.

resource_exists(ReqData, Context) ->
    {true, ReqData, Context}.

provide_content(ReqData, Context) ->
    WalrusContext = [{fields, [
			       [{name, "username"}, {placeholder, "username"}],
			       [{name, "email-address"}, {placeholder, "email address (optional)"}],
			       [{name, "password-1"}, {placeholder, "password"}],
			       [{name, "password-2"}, {placeholder, "repeat password"}]
			      ]}],
    Rendered = node_walrus:render_template(node_views_signup_email, WalrusContext),
    {Rendered, ReqData, Context}.

content_types_accepted(ReqData, Context) ->
    {[{"application/json", accept_content}], ReqData, Context}.

post_is_create(ReqData, Context) ->
    {true, ReqData, Context}.

create_path(ReqData, Context) ->
    {"not used", ReqData, Context}. 

malformed_request(ReqData, Context = #context{ method='GET'}) ->
    {false, ReqData, Context};
malformed_request(ReqData, Context = #context{ method='POST'}) ->
    Body = wrq:req_body(ReqData),
    try
	JSON = jiffy:decode(Body),
	case validate([fun validate_required/1, 
		       fun validate_username/1,
		       fun validate_email/1,
		       fun validate_passwords/1], JSON) of
	    ok ->
		{false, ReqData, Context};
	    {error, Response} ->
		{true, node_resource:json_response(Response, ReqData), Context}
	end
	    
    catch
	throw:{error,{_Pos,invalid_json}} ->
            lager:warning("invalid JSON: ~p", [Body]),
	    {true, node_resource:json_response(<<"invalid JSON">>, ReqData), Context};
	Err:Reason ->
	    lager:warning("Unexpected exception during validate: ~p:~p", [Err, Reason]),
	    {true,  node_resource:json_response(<<"internal error">>, ReqData), Context}
    end.


accept_content(ReqData, Context) ->
    Body = wrq:req_body(ReqData),
    {Props} = jiffy:decode(Body),
    {_, Username} = lists:keyfind(<<"username">>, 1, Props),
    {_, Password} = lists:keyfind(<<"password-1">>, 1, Props),
    EmailAddress = case lists:keyfind(<<"email-address">>, 1, Props) of
		       {_, Addr} ->
			   Addr;
		       false ->
			   <<"">>
		   end,
    case node_db:create_user(binary_to_list(Username), 
			     binary_to_list(Password), 
			     binary_to_list(EmailAddress)) of
	ok ->
	    {true, node_resource:json_response(<<"created">>, ReqData), Context};
	already_exists ->
	    {{halt, 409}, node_resource:json_response(<<"already exists">>, ReqData), Context}
    end.

validate([Hd|Rest], JSON) ->
    case Hd(JSON) of
	{error, Reason} ->
	    {error, Reason};
	ok ->
	    validate(Rest, JSON)
    end;
validate([], _JSON) ->
    ok.

validate_required({Props}) ->
    RequiredFields = [<<"username">>, <<"password-1">>, <<"password-2">>],
    Missing = lists:foldr(fun(Field, Acc) ->
				  case lists:keyfind(Field, 1, Props) of
				      {_, _} ->
					  Acc;
				      false ->
					  [{Field, <<"required">>}|Acc]
				  end
			  end,
			  [],
			  RequiredFields),
    case Missing of 
	[] ->
	    ok;
	MissingProps ->
	    {error, {MissingProps}}
    end.

validate_username({Props}) ->
    {_, Username} = lists:keyfind(<<"username">>, 1, Props),
    String = string:strip(binary_to_list(Username)),
    Pattern = "^[A-Z0-9._-]+$",
    case re:run(String, Pattern, [caseless]) of
	{match,[_]} ->
	    ok;
	nomatch ->
	    {error, {[{<<"username">>, <<"can only contain letters, numbers, dots, dashes and underscores">>}]}}
    end.

validate_passwords({Props}) ->
    {_, Password1} = lists:keyfind(<<"password-1">>, 1, Props),
    {_, Password2} = lists:keyfind(<<"password-2">>, 1, Props),
    if
	Password1 =:= Password2 ->
	    ok;
	true ->
	    {error, {[{<<"password-2">>, <<"doesn't match">>}]}}
    end.
    

validate_email({Props}) ->
    case lists:keyfind(<<"email-address">>, 1, Props) of
	{_, EmailAddress} ->
	    String = string:strip(binary_to_list(EmailAddress)),
	    Pattern = "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,4}$",
	    case re:run(String, Pattern, [caseless]) of
		{match,[_]} ->
		    ok;
		nomatch ->
		    {error, {[{<<"email-address">>, <<"invalid email address">>}]}}
	    end;
	_ ->
	    ok
    end.

-ifdef(TEST).

validate_required_test_() ->
    [
     ?_assertEqual({error, {[{<<"username">>, <<"required">>},
			     {<<"password-1">>, <<"required">>},
			     {<<"password-2">>, <<"required">>}]}},
		   validate_required({[]})),
     ?_assertEqual({error, {[{<<"username">>, <<"required">>},
			     {<<"password-2">>, <<"required">>}]}},
		   validate_required({[{<<"password-1">>, <<"abc">>}]}))

    ].

validate_username_test_() ->
    Reason = <<"can only contain letters, numbers, dots, dashes and underscores">>,
    [
     ?_assertEqual({error, {[{<<"username">>, Reason}]}},
		   validate_username({[{<<"username">>, <<"&^%">>}]})),
     ?_assertEqual({error, {[{<<"username">>, Reason}]}},
		   validate_username({[{<<"username">>, <<"user name">>}]})),
     ?_assertEqual(ok,
		   validate_username({[{<<"username">>, <<"user.name">>}]})),
     ?_assertEqual(ok,
		   validate_username({[{<<"username">>, <<"132.user-name_with">>}]}))
    ].

validate_email_test_() ->
    [
     ?_assertEqual({error, {[{<<"email-address">>, <<"invalid email address">>}]}}, 
		   validate_email({[{<<"email-address">>,
				     <<"bjnortier@gmail">>}]})),
     ?_assertEqual({error, {[{<<"email-address">>, <<"invalid email address">>}]}}, 
		   validate_email({[{<<"email-address">>,
				     <<"bjnortier@">>}]})),
     ?_assertEqual({error, {[{<<"email-address">>, <<"invalid email address">>}]}}, 
		   validate_email({[{<<"email-address">>,
				     <<"bjnortier">>}]})),
     ?_assertEqual({error, {[{<<"email-address">>, <<"invalid email address">>}]}}, 
		   validate_email({[{<<"email-address">>,
				     <<"">>}]})),

     ?_assertEqual(ok, validate_email({[{<<"email-address">>,
					 <<"bjnortier@gmail.com">>}]})),
     ?_assertEqual(ok, validate_email({[{<<"email-address">>,
					 <<"  bjnortier@gmail.com   ">>}]}))
    ].

validate_password_test_() ->
    [
     ?_assertEqual({error, {[{<<"password-2">>, <<"doesn't match">>}]}},
		   validate_passwords({[{<<"password-1">>, <<"abc">>},
					{<<"password-2">>, <<"ab">>}
				       ]})),
     ?_assertEqual(ok,
		   validate_passwords({[{<<"password-1">>, <<"abc">>},
					{<<"password-2">>, <<"abc">>}
				       ]}))
    ].

-endif.



